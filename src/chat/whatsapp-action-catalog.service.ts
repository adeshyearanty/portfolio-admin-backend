import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppActionCatalog {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Allowed server-side action catalog mapping to configured URLs.
   */
  get Catalog(): Record<string, string> {
    return {
      portfolio:
        this.configService.get<string>('app.portfolioUrl') ||
        process.env.PORTFOLIO_URL ||
        'https://portfolio.example.com',
      github:
        this.configService.get<string>('app.githubUrl') ||
        process.env.GITHUB_URL ||
        'https://github.com/adeshyearanty',
      linkedin:
        this.configService.get<string>('app.linkedinUrl') ||
        process.env.LINKEDIN_URL ||
        'https://linkedin.com/in/adeshyearanty',
      resume:
        this.configService.get<string>('app.resumeUrl') ||
        process.env.RESUME_URL ||
        'https://portfolio.example.com/resume.pdf',
      projects:
        this.configService.get<string>('app.projectsUrl') ||
        process.env.PROJECTS_URL ||
        'https://portfolio.example.com/projects',
      contact:
        this.configService.get<string>('app.contactUrl') ||
        process.env.CONTACT_URL ||
        'https://portfolio.example.com/contact',
    };
  }

  /**
   * Resolves an action identifier to its server-validated, configured URL.
   * Returns null if the action ID is not present in the allowlist.
   */
  resolveUrl(actionId: string): string | null {
    if (!actionId) return null;
    const normalizedId = actionId.toLowerCase().trim();
    return this.Catalog[normalizedId] || null;
  }

  /**
   * Returns true if actionId is a valid, configured URL action in the allowlist.
   */
  isAllowedAction(actionId: string): boolean {
    return this.resolveUrl(actionId) !== null;
  }
}
