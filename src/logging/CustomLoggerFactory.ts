import type { Logger, LoggerFactory } from '@solid/community-server';
import { CustomLogger } from './CustomLogger';

/**
 * A custom logger to demonstrate how to extend the CSS with a custom module.
 *
 * This creates instances of {@link CustomLogger}.
 */
export class CustomLoggerFactory implements LoggerFactory {
  private readonly level: string;
  public constructor(level: string) {
    this.level = level;
  }

  public createLogger(label: string): Logger {
    return new CustomLogger(label, this.level);
  }
}

