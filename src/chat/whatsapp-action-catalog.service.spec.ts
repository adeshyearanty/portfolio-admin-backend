import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WhatsAppActionCatalog } from './whatsapp-action-catalog.service';

describe('WhatsAppActionCatalog', () => {
  let catalog: WhatsAppActionCatalog;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'app.portfolioUrl') return 'https://portfolio.test.com';
      if (key === 'app.githubUrl') return 'https://github.com/testuser';
      if (key === 'app.linkedinUrl') return 'https://linkedin.com/in/testuser';
      if (key === 'app.resumeUrl') return 'https://portfolio.test.com/resume.pdf';
      if (key === 'app.projectsUrl') return 'https://portfolio.test.com/projects';
      if (key === 'app.contactUrl') return 'https://portfolio.test.com/contact';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppActionCatalog,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    catalog = module.get<WhatsAppActionCatalog>(WhatsAppActionCatalog);
  });

  it('should be defined', () => {
    expect(catalog).toBeDefined();
  });

  it('should resolve allowed action IDs to configured URLs', () => {
    expect(catalog.resolveUrl('github')).toBe('https://github.com/testuser');
    expect(catalog.resolveUrl('PORTFOLIO')).toBe('https://portfolio.test.com');
    expect(catalog.resolveUrl('linkedin')).toBe('https://linkedin.com/in/testuser');
    expect(catalog.resolveUrl('resume')).toBe('https://portfolio.test.com/resume.pdf');
    expect(catalog.resolveUrl('projects')).toBe('https://portfolio.test.com/projects');
    expect(catalog.resolveUrl('contact')).toBe('https://portfolio.test.com/contact');
  });

  it('should reject unauthorized / unknown action IDs', () => {
    expect(catalog.resolveUrl('unauthorized-site')).toBeNull();
    expect(catalog.resolveUrl('http://malicious.com')).toBeNull();
    expect(catalog.isAllowedAction('unknown')).toBe(false);
  });
});
