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
          interactive?: {
            type?: 'button_reply' | 'list_reply';
            button_reply?: {
              id: string;
              title: string;
            };
            list_reply?: {
              id: string;
              title: string;
              description?: string;
            };
          };
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

    let messageText: string | undefined = undefined;

    const ACTION_INTENT_MAP: Record<string, string> = {
      frontend: "Tell me about Adesh's frontend development experience and technical skills.",
      backend: "Tell me about Adesh's backend development experience, microservices, and technical skills.",
      aws: "Tell me about Adesh's AWS and cloud infrastructure experience.",
      projects: "Show me Adesh's key portfolio projects.",
      experience: "Tell me about Adesh's professional work experience and background.",
      contact: "How can I contact Adesh or view his contact details?",
      resume: "How can I view Adesh's resume?",
    };

    if (message.type === 'text' && message.text?.body) {
      messageText = message.text.body;
    } else if (message.type === 'interactive' && message.interactive) {
      const buttonReply = message.interactive.button_reply;
      const listReply = message.interactive.list_reply;

      if (buttonReply) {
        const actionId = buttonReply.id;
        const title = buttonReply.title;
        messageText = ACTION_INTENT_MAP[actionId.toLowerCase()] || title || actionId;
      } else if (listReply) {
        const actionId = listReply.id;
        const title = listReply.title;
        messageText = ACTION_INTENT_MAP[actionId.toLowerCase()] || title || actionId;
      }
    }

    if (!messageText) {
      this.logger.log(`Ignoring non-text / unsupported message type: ${message.type}`);
      return 'EVENT_RECEIVED';
    }

    // 4. De-duplicate messages
    if (this.deDupCache.has(messageId)) {
      this.logger.warn(`Duplicate message ignored: ID ${messageId}`);
      return 'EVENT_RECEIVED';
    }
    this.deDupCache.set(messageId, Date.now());

    this.logger.log(`Processing message from ${sender}: "${messageText}"`);

    // Send typing indicator best-effort before starting processing
    await this.sendWhatsappTypingIndicator(messageId);

    // 5. Query ChatService using phone number as the unique sessionId for memory preservation
    try {
      const response = await this.chatService.handleUserMessage(
        messageText,
        sender,
        'whatsapp',
      );

      // 6. Send reply message or interactive payload using Meta API
      if (response.whatsappPayload) {
        await this.sendWhatsappPayload(response.whatsappPayload);
      } else {
        await this.sendWhatsappReply(sender, response.answer);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to process message or send WhatsApp reply: ${errMsg}`,
      );
    }

    return 'EVENT_RECEIVED';
  }

  private async sendWhatsappTypingIndicator(
    messageId: string,
  ): Promise<void> {
    const phoneNumberId = this.configService.get<string>(
      'app.whatsappPhoneNumberId',
    );
    const accessToken = this.configService.get<string>(
      'app.whatsappAccessToken',
    );

    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        'WhatsApp ACCESS_TOKEN or PHONE_NUMBER_ID is not configured. Skipping typing indicator.',
      );
      return;
    }

    try {
      const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: {
          type: 'text',
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
        this.logger.error(
          `Failed to send WhatsApp typing indicator (status ${response.status}): ${errorText}`,
        );
      } else {
        this.logger.log(
          `Successfully sent WhatsApp typing indicator for message ID: ${messageId}`,
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to send WhatsApp typing indicator: ${errMsg}`,
      );
    }
  }

  private async sendWhatsappPayload(payload: any): Promise<void> {
    const phoneNumberId = this.configService.get<string>(
      'app.whatsappPhoneNumberId',
    );
    const accessToken = this.configService.get<string>(
      'app.whatsappAccessToken',
    );

    if (!phoneNumberId || !accessToken) {
      this.logger.error(
        'WhatsApp ACCESS_TOKEN or PHONE_NUMBER_ID is not configured. Payload body: ' +
          JSON.stringify(payload),
      );
      return;
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

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

    this.logger.log(`Successfully dispatched WhatsApp message to ${payload.to}`);
  }

  private async sendWhatsappReply(
    to: string,
    replyText: string,
  ): Promise<void> {
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
    await this.sendWhatsappPayload(payload);
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
