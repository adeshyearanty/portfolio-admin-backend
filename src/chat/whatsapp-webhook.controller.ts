import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

export interface WhatsappWebhookBody {
  object: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: {
            name?: string;
          };
          wa_id?: string;
        }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp?: string;
          text?: {
            body: string;
          };
          type?: string;
        }>;
        statuses?: any[];
      };
      field: string;
    }>;
  }>;
}

@Controller('whatsapp-webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);
  private readonly deDupCache = new Map<string, number>(); // messageId -> timestamp
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes de-dup retention

  constructor(
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
  ) { }

  @Get()
  @HttpCode(HttpStatus.OK)
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') token: string,
  ): string {
    this.logger.log('Receiving Webhook Verification request.');

    const configuredToken = this.configService.get<string>(
      'app.whatsappVerifyToken',
    );
    this.logger.log('config: ' + configuredToken);
    this.logger.log('query: ' + JSON.stringify({ mode, challenge, token }));

    if (mode === 'subscribe' && token === configuredToken) {
      this.logger.log('Webhook verified successfully!');
      return challenge;
    }

    this.logger.error('Webhook verification failed: token mismatch');
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receiveMessage(@Body() body: WhatsappWebhookBody): Promise<string> {
    this.logger.log('Received WhatsApp Webhook body notification');

    // 1. Validate structure is from WhatsApp messaging product
    if (body.object !== 'whatsapp_business_account') {
      return 'EVENT_RECEIVED';
    }

    // 2. Clear old de-dup cache items
    this.cleanDeDupCache();

    // 3. Process entries
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Ignore status events (they have "statuses" array and no "messages" array)
    if (!value || !value.messages || value.messages.length === 0) {
      this.logger.log('Ignoring non-message/status change event');
      return 'EVENT_RECEIVED';
    }

    const message = value.messages[0];
    const messageId = message.id;
    const sender = message.from; // Sender's phone number

    // Extract message body
    const messageText = message.text?.body;
    if (!messageText) {
      this.logger.log(`Ignoring non-text message type: ${message.type}`);
      return 'EVENT_RECEIVED';
    }

    // 4. De-duplicate messages
    if (this.deDupCache.has(messageId)) {
      this.logger.warn(`Duplicate message ignored: ID ${messageId}`);
      return 'EVENT_RECEIVED';
    }
    this.deDupCache.set(messageId, Date.now());

    this.logger.log(`Processing message from ${sender}: "${messageText}"`);

    // 5. Query ChatService using phone number as the unique sessionId for memory preservation
    try {
      const response = await this.chatService.handleUserMessage(
        messageText,
        sender,
        'whatsapp',
      );

      // 6. Send reply message using Meta API
      await this.sendWhatsappReply(sender, response.answer);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to process message or send WhatsApp reply: ${errMsg}`,
      );
    }

    return 'EVENT_RECEIVED';
  }

  private async sendWhatsappReply(
    to: string,
    replyText: string,
  ): Promise<void> {
    const phoneNumberId = this.configService.get<string>(
      'app.whatsappPhoneNumberId',
    );
    const accessToken = this.configService.get<string>(
      'app.whatsappAccessToken',
    );

    if (!phoneNumberId || !accessToken) {
      this.logger.error(
        'WhatsApp ACCESS_TOKEN or PHONE_NUMBER_ID is not configured. Reply output log: ' +
        replyText,
      );
      return;
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: replyText,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Meta Graph API returned status ${response.status}: ${errorText}`,
      );
    }

    this.logger.log(`Successfully dispatched WhatsApp reply message to ${to}`);
  }

  private cleanDeDupCache(): void {
    const now = Date.now();
    for (const [key, val] of this.deDupCache.entries()) {
      if (now - val > this.CACHE_TTL) {
        this.deDupCache.delete(key);
      }
    }
  }
}
