import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppResponseBuilder } from './whatsapp-response-builder.service';
import { WhatsAppActionCatalog } from './whatsapp-action-catalog.service';
import { StructuredWhatsAppResponse } from './whatsapp-response-validator.service';

describe('WhatsAppResponseBuilder', () => {
  let builder: WhatsAppResponseBuilder;

  const mockActionCatalog = {
    resolveUrl: jest.fn((id: string) => {
      if (id === 'github') return 'https://github.com/adeshyearanty';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppResponseBuilder,
        {
          provide: WhatsAppActionCatalog,
          useValue: mockActionCatalog,
        },
      ],
    }).compile();

    builder = module.get<WhatsAppResponseBuilder>(WhatsAppResponseBuilder);
  });

  it('should be defined', () => {
    expect(builder).toBeDefined();
  });

  it('should build a plain text payload when actions are empty', () => {
    const response: StructuredWhatsAppResponse = {
      text: 'Hello, this is a plain text answer.',
      actions: [],
    };

    const payload = builder.buildPayload('1234567890', response);
    expect(payload.type).toBe('text');
    expect(payload.to).toBe('1234567890');
    expect(payload.text?.body).toBe('Hello, this is a plain text answer.');
  });

  it('should build an interactive reply buttons payload for 1-3 reply actions', () => {
    const response: StructuredWhatsAppResponse = {
      text: 'Which area would you like to explore?',
      actions: [
        { type: 'reply', id: 'frontend', title: 'Frontend' },
        { type: 'reply', id: 'backend', title: 'Backend' },
      ],
    };

    const payload = builder.buildPayload('1234567890', response);
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.type).toBe('button');
    expect(payload.interactive.action.buttons).toHaveLength(2);
    expect(payload.interactive.action.buttons[0].reply).toEqual({
      id: 'frontend',
      title: 'Frontend',
    });
  });

  it('should build an interactive list payload for list actions', () => {
    const response: StructuredWhatsAppResponse = {
      text: 'Choose an option:',
      actions: [
        { type: 'list', id: 'opt1', title: 'Option 1', description: 'Desc 1' },
        { type: 'list', id: 'opt2', title: 'Option 2', description: 'Desc 2' },
      ],
    };

    const payload = builder.buildPayload('1234567890', response);
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.action.sections[0].rows).toHaveLength(2);
  });

  it('should build a CTA URL button payload for url action', () => {
    const response: StructuredWhatsAppResponse = {
      text: 'Check out my GitHub repository:',
      actions: [{ type: 'url', id: 'github', title: 'View GitHub', urlAction: 'github' }],
    };

    const payload = builder.buildPayload('1234567890', response);
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.type).toBe('cta_url');
    expect(payload.interactive.action.parameters.url).toBe('https://github.com/adeshyearanty');
  });

  it('should truncate interactive message body text to 1024 characters max to comply with Meta API limit', () => {
    const longText = 'A'.repeat(1500);
    const response: StructuredWhatsAppResponse = {
      text: longText,
      actions: [{ type: 'reply', id: 'frontend', title: 'Frontend' }],
    };

    const payload = builder.buildPayload('1234567890', response);
    expect(payload.type).toBe('interactive');
    expect(payload.interactive.body.text.length).toBe(1024);
  });
});
