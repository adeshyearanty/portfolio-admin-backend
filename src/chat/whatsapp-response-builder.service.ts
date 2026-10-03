import { Injectable, Logger } from '@nestjs/common';
import { StructuredWhatsAppResponse, WhatsAppAction } from './whatsapp-response-validator.service';
import { WhatsAppLimits } from './whatsapp-limits';
import { WhatsAppActionCatalog } from './whatsapp-action-catalog.service';

export interface MetaWhatsAppPayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text' | 'interactive';
  text?: {
    preview_url: boolean;
    body: string;
  };
  interactive?: any;
}

@Injectable()
export class WhatsAppResponseBuilder {
  private readonly logger = new Logger(WhatsAppResponseBuilder.name);

  constructor(private readonly actionCatalog: WhatsAppActionCatalog) {}

  /**
   * Builds the exact Meta WhatsApp Cloud API request payload based on the structured response.
   * If interactive creation fails or actions are empty, falls back safely to a text message payload.
   */
  buildPayload(to: string, response: StructuredWhatsAppResponse): MetaWhatsAppPayload {
    try {
      const { text, actions } = response;

      if (!actions || actions.length === 0) {
        return this.buildTextPayload(to, text);
      }

      const replyActions = actions.filter((a) => a.type === 'reply');
      const listActions = actions.filter((a) => a.type === 'list');
      const urlActions = actions.filter((a) => a.type === 'url');

      // 1. Interactive Reply Buttons Message (1 to 3 reply buttons)
      if (replyActions.length > 0 && replyActions.length <= WhatsAppLimits.MAX_REPLY_BUTTONS) {
        return this.buildReplyButtonsPayload(to, text, replyActions);
      }

      // 2. Interactive List Message
      if (listActions.length > 0) {
        return this.buildListPayload(to, text, listActions);
      }

      // 3. Interactive Call-To-Action (CTA) URL Button Message
      if (urlActions.length > 0) {
        const urlAction = urlActions[0];
        const resolvedUrl = this.actionCatalog.resolveUrl(
          urlAction.urlAction || urlAction.id,
        );

        if (resolvedUrl) {
          return this.buildCtaUrlPayload(to, text, urlAction.title, resolvedUrl);
        }
      }

      // Default Fallback
      return this.buildTextPayload(to, text);
    } catch (err) {
      this.logger.error(
        `Failed to build interactive WhatsApp payload: ${err instanceof Error ? err.message : String(err)}. Falling back to plain text payload.`,
      );
      return this.buildTextPayload(to, response.text);
    }
  }

  /**
   * Builds a standard plain text Meta payload.
   */
  buildTextPayload(to: string, text: string): MetaWhatsAppPayload {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: (text || '').substring(0, WhatsAppLimits.MAX_BODY_TEXT_LENGTH),
      },
    };
  }

  /**
   * Builds an Interactive Reply Buttons Meta payload (up to 3 buttons).
   */
  private buildReplyButtonsPayload(
    to: string,
    bodyText: string,
    replyActions: WhatsAppAction[],
  ): MetaWhatsAppPayload {
    const buttons = replyActions.map((action) => ({
      type: 'reply',
      reply: {
        id: action.id.substring(0, WhatsAppLimits.MAX_BUTTON_ID_LENGTH),
        title: action.title.substring(0, WhatsAppLimits.MAX_BUTTON_TITLE_LENGTH),
      },
    }));

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: (bodyText || '').substring(
            0,
            WhatsAppLimits.MAX_INTERACTIVE_BODY_TEXT_LENGTH,
          ),
        },
        action: {
          buttons,
        },
      },
    };
  }

  /**
   * Builds an Interactive List Meta payload (up to 10 rows).
   */
  private buildListPayload(
    to: string,
    bodyText: string,
    listActions: WhatsAppAction[],
  ): MetaWhatsAppPayload {
    const rows = listActions.slice(0, WhatsAppLimits.MAX_LIST_ROWS).map((action) => ({
      id: action.id.substring(0, WhatsAppLimits.MAX_BUTTON_ID_LENGTH),
      title: action.title.substring(0, WhatsAppLimits.MAX_LIST_TITLE_LENGTH),
      ...(action.description
        ? {
            description: action.description.substring(
              0,
              WhatsAppLimits.MAX_LIST_DESC_LENGTH,
            ),
          }
        : {}),
    }));

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text: (bodyText || '').substring(
            0,
            WhatsAppLimits.MAX_INTERACTIVE_BODY_TEXT_LENGTH,
          ),
        },
        action: {
          button: 'Explore Options',
          sections: [
            {
              title: 'Available Options',
              rows,
            },
          ],
        },
      },
    };
  }

  /**
   * Builds an Interactive Call-to-Action (CTA) URL Button Meta payload.
   */
  private buildCtaUrlPayload(
    to: string,
    bodyText: string,
    buttonTitle: string,
    url: string,
  ): MetaWhatsAppPayload {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: (bodyText || '').substring(
            0,
            WhatsAppLimits.MAX_INTERACTIVE_BODY_TEXT_LENGTH,
          ),
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: buttonTitle.substring(
              0,
              WhatsAppLimits.MAX_BUTTON_TITLE_LENGTH,
            ),
            url,
          },
        },
      },
    };
  }
}
