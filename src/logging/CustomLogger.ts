import type { Logger, LogLevel } from '@solid/community-server';

/**
 * A custom logger to demonstrate how to extend the CSS with a custom module.
 *
 * This creates instances of {@link CustomLogger}.
 */
export class CustomLogger implements Logger {
  public constructor(
    private readonly label: string,
    private readonly level: string,
  ) {
  }

  public log(level: LogLevel, message: string, meta?: any): Logger {
    // eslint-disable-next-line no-console
    console.log(`${this.label} [${this.level}] ${message} -- Meta: ${meta}`);
    return this;
  }

  public debug(message: string, meta?: any): Logger {
    this.log('debug', message, meta);
    return this;
  }

  public error(message: string, meta?: any): Logger {
    this.log('error', message, meta);
    return this;
  }

  public info(message: string, meta?: any): Logger {
    this.log('info', message, meta);
    return this;
  }

  public silly(message: string, meta?: any): Logger {
    this.log('silly', message, meta);
    return this;
  }

  public verbose(message: string, meta?: any): Logger {
    this.log('verbose', message, meta);
    return this;
  }

  public warn(message: string, meta?: any): Logger {
    this.log('warn', message, meta);
    return this;
  }
}
