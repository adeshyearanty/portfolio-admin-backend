import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppResponseValidator } from './whatsapp-response-validator.service';
import { WhatsAppActionCatalog } from './whatsapp-action-catalog.service';

describe('WhatsAppResponseValidator', () => {
  let validator: WhatsAppResponseValidator;

  const mockActionCatalog = {
    isAllowedAction: jest.fn((id: string) => {
      const allowed = ['github', 'portfolio', 'linkedin', 'resume', 'projects', 'contact'];
      return allowed.includes(id.toLowerCase());
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppResponseValidator,
        {
          provide: WhatsAppActionCatalog,
          useValue: mockActionCatalog,
        },
      ],
    }).compile();

    validator = module.get<WhatsAppResponseValidator>(WhatsAppResponseValidator);
  });

  it('should be defined', () => {
    expect(validator).toBeDefined();
  });

  it('should parse valid structured JSON with reply actions', () => {
    const json = JSON.stringify({
      text: 'Which topic would you like to explore?',
      actions: [
        { type: 'reply', id: 'frontend', title: 'Frontend' },
        { type: 'reply', id: 'backend', title: 'Backend' },
      ],
    });

    const result = validator.validate(json);
    expect(result.text).toBe('Which topic would you like to explore?');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({
      type: 'reply',
      id: 'frontend',
      title: 'Frontend',
    });
  });

  it('should fallback gracefully for invalid JSON', () => {
    const rawText = 'I am a software engineer with NestJS experience.';
    const result = validator.validate(rawText);

    expect(result.text).toBe(rawText);
    expect(result.actions).toEqual([]);
  });

  it('should validate allowed URL actions and reject unauthorized URLs', () => {
    const json = JSON.stringify({
      text: 'Here are my links:',
      actions: [
        { type: 'url', id: 'github', title: 'View GitHub' },
        { type: 'url', id: 'unauthorized_link', title: 'Bad Link' },
      ],
    });

    const result = validator.validate(json);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].id).toBe('github');
  });

  it('should trim button title exceeding 20 characters', () => {
    const json = JSON.stringify({
      text: 'Options:',
      actions: [
        {
          type: 'reply',
          id: 'long_title',
          title: 'This title is definitely way too long for Meta',
        },
      ],
    });

    const result = validator.validate(json);
    expect(result.actions[0].title.length).toBeLessThanOrEqual(20);
    expect(result.actions[0].title).toBe('This title is defini');
  });

  it('should auto-convert >3 reply buttons into a list message', () => {
    const json = JSON.stringify({
      text: 'Choose a topic:',
      actions: [
        { type: 'reply', id: 'opt1', title: 'Option 1' },
        { type: 'reply', id: 'opt2', title: 'Option 2' },
        { type: 'reply', id: 'opt3', title: 'Option 3' },
        { type: 'reply', id: 'opt4', title: 'Option 4' },
      ],
    });

    const result = validator.validate(json);
    expect(result.actions.every((a) => a.type === 'list')).toBe(true);
    expect(result.actions).toHaveLength(4);
  });
});
