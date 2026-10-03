import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppLimits } from './whatsapp-limits';
import { WhatsAppActionCatalog } from './whatsapp-action-catalog.service';

export interface WhatsAppAction {
  type: 'reply' | 'url' | 'list';
  id: string;
  title: string;
  description?: string;
  urlAction?: string;
  sectionTitle?: string;
}

export interface StructuredWhatsAppResponse {
  text: string;
  actions: WhatsAppAction[];
}

@Injectable()
export class WhatsAppResponseValidator {
  private readonly logger = new Logger(WhatsAppResponseValidator.name);

  constructor(private readonly actionCatalog: WhatsAppActionCatalog) {}

  /**
   * Safely parses and validates an LLM output string or object into a safe StructuredWhatsAppResponse.
   * Never throws — falls back gracefully to { text: rawOutput, actions: [] } if invalid.
   */
  validate(rawOutput: unknown): StructuredWhatsAppResponse {
    if (!rawOutput) {
      return { text: '', actions: [] };
    }

    let parsed: any = null;
    const rawStr = typeof rawOutput === 'string' ? rawOutput.trim() : '';

    if (typeof rawOutput === 'object' && rawOutput !== null) {
      parsed = rawOutput;
    } else if (rawStr) {
      // Step 1: Clean code fences if rawStr starts/ends with ```
      let cleaned = rawStr;
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }

      // Step 2: Try direct JSON.parse
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Step 3: Try regex match for ```json { ... } ``` fence embedded inside text
        const fenceMatch = rawStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/i);
        if (fenceMatch && fenceMatch[1]) {
          try {
            parsed = JSON.parse(fenceMatch[1]);
          } catch {
            parsed = null;
          }
        }

        // Step 4: Try finding JSON object braces `{` to `}`
        if (!parsed) {
          const firstBrace = rawStr.indexOf('{');
          const lastBrace = rawStr.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const potentialJson = rawStr.substring(firstBrace, lastBrace + 1);
            try {
              parsed = JSON.parse(potentialJson);
            } catch {
              parsed = null;
            }
          }
        }
      }
    }

    // Fallback if no valid JSON object was parsed
    if (!parsed || typeof parsed !== 'object') {
      const cleanText = rawStr
        .replace(/```(?:json)?[\s\S]*?```/gi, '')
        .replace(/\{[\s\S]*"actions"[\s\S]*\}/gi, '')
        .trim();
      return { text: cleanText || rawStr, actions: [] };
    }

    // Extract text from parsed JSON object
    let text =
      typeof parsed.text === 'string'
        ? parsed.text.trim()
        : String(parsed.text || '').trim();

    // If parsed.text is empty, check if there was text preceding the JSON block in rawStr
    if (!text && rawStr) {
      const firstBrace = rawStr.indexOf('{');
      if (firstBrace > 0) {
        text = rawStr.substring(0, firstBrace).trim();
      }
    }

    if (!Array.isArray(parsed.actions) || parsed.actions.length === 0) {
      return { text, actions: [] };
    }

    const validatedActions: WhatsAppAction[] = [];

    for (const rawAction of parsed.actions) {
      if (!rawAction || typeof rawAction !== 'object') continue;

      const type = String(rawAction.type || '').toLowerCase();
      const id = String(rawAction.id || rawAction.action || '').trim();
      const title = String(rawAction.title || rawAction.text || '').trim();
      const description = rawAction.description
        ? String(rawAction.description).trim()
        : undefined;

      if (!id || !title) continue;

      if (type === 'reply') {
        validatedActions.push({
          type: 'reply',
          id: id.substring(0, WhatsAppLimits.MAX_BUTTON_ID_LENGTH),
          title: title.substring(0, WhatsAppLimits.MAX_BUTTON_TITLE_LENGTH),
        });
      } else if (type === 'url') {
        const urlActionKey = (rawAction.urlAction || id).toLowerCase().trim();
        if (this.actionCatalog.isAllowedAction(urlActionKey)) {
          validatedActions.push({
            type: 'url',
            id: urlActionKey,
            title: title.substring(0, WhatsAppLimits.MAX_BUTTON_TITLE_LENGTH),
            urlAction: urlActionKey,
          });
        } else {
          this.logger.warn(
            `Rejected unauthorized URL action ID from LLM: "${urlActionKey}"`,
          );
        }
      } else if (type === 'list') {
        validatedActions.push({
          type: 'list',
          id: id.substring(0, WhatsAppLimits.MAX_BUTTON_ID_LENGTH),
          title: title.substring(0, WhatsAppLimits.MAX_LIST_TITLE_LENGTH),
          description: description
            ? description.substring(0, WhatsAppLimits.MAX_LIST_DESC_LENGTH)
            : undefined,
          sectionTitle: rawAction.sectionTitle
            ? String(rawAction.sectionTitle).substring(
                0,
                WhatsAppLimits.MAX_LIST_TITLE_LENGTH,
              )
            : undefined,
        });
      }
    }

    // Handle button count limits and conversions
    const replyActions = validatedActions.filter((a) => a.type === 'reply');
    const urlActions = validatedActions.filter((a) => a.type === 'url');
    const listActions = validatedActions.filter((a) => a.type === 'list');

    // If reply actions exceed 3 choices (up to 10), convert them into a list message!
    if (replyActions.length > WhatsAppLimits.MAX_REPLY_BUTTONS) {
      this.logger.log(
        `Converting ${replyActions.length} reply buttons into a list message to conform to WhatsApp 3-button limit`,
      );
      const convertedList: WhatsAppAction[] = replyActions
        .slice(0, WhatsAppLimits.MAX_LIST_ROWS)
        .map((r) => ({
          type: 'list',
          id: r.id,
          title: r.title.substring(0, WhatsAppLimits.MAX_LIST_TITLE_LENGTH),
        }));
      return { text, actions: [...convertedList, ...urlActions] };
    }

    // Slice list actions to max 10
    const finalActions: WhatsAppAction[] = [
      ...replyActions,
      ...listActions.slice(0, WhatsAppLimits.MAX_LIST_ROWS),
      ...urlActions.slice(0, 1), // Max 1 CTA URL button
    ];

    return { text, actions: finalActions };
  }
}
