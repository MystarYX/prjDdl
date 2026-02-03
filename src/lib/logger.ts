/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * 日志配置
 */
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableStorage: boolean;
  storageKey: string;
  maxLogs: number;
}

/**
 * 日志条目
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  module?: string;
}

/**
 * 日志管理器
 */
class Logger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    this.config = {
      level: isDevelopment ? LogLevel.DEBUG : LogLevel.WARN,
      enableConsole: isDevelopment,
      enableStorage: false,
      storageKey: 'app_logs',
      maxLogs: 100,
      ...config,
    };

    // 从 localStorage 加载之前的日志
    this.loadLogs();
  }

  /**
   * 记录日志
   */
  private log(level: LogLevel, message: string, data?: any, module?: string) {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      module,
    };

    // 添加到内存
    this.logs.push(entry);

    // 限制日志数量
    if (this.logs.length > this.config.maxLogs) {
      this.logs.shift();
    }

    // 控制台输出
    if (this.config.enableConsole) {
      this.consoleLog(entry);
    }

    // 持久化存储
    if (this.config.enableStorage) {
      this.saveLogs();
    }
  }

  /**
   * 控制台输出
   */
  private consoleLog(entry: LogEntry) {
    const prefix = `[${entry.level}]${entry.module ? `[${entry.module}]` : ''}`;
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${timestamp} ${prefix}`, entry.message, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(`${timestamp} ${prefix}`, entry.message, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(`${timestamp} ${prefix}`, entry.message, entry.data || '');
        break;
      case LogLevel.ERROR:
        console.error(`${timestamp} ${prefix}`, entry.message, entry.data || '');
        break;
    }
  }

  /**
   * 保存日志到 localStorage
   */
  private saveLogs() {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.logs));
    } catch (e) {
      // 静默失败，避免无限循环
    }
  }

  /**
   * 从 localStorage 加载日志
   */
  private loadLogs() {
    try {
      const saved = localStorage.getItem(this.config.storageKey);
      if (saved) {
        this.logs = JSON.parse(saved);
      }
    } catch (e) {
      // 静默失败
    }
  }

  /**
   * 获取所有日志
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.logs = [];
    localStorage.removeItem(this.config.storageKey);
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, data?: any, module?: string) {
    this.log(LogLevel.DEBUG, message, data, module);
  }

  /**
   * INFO 级别日志
   */
  info(message: string, data?: any, module?: string) {
    this.log(LogLevel.INFO, message, data, module);
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, data?: any, module?: string) {
    this.log(LogLevel.WARN, message, data, module);
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, data?: any, module?: string) {
    this.log(LogLevel.ERROR, message, data, module);
  }

  /**
   * 创建模块化的 logger
   */
  createModuleLogger(module: string) {
    return {
      debug: (message: string, data?: any) => this.debug(message, data, module),
      info: (message: string, data?: any) => this.info(message, data, module),
      warn: (message: string, data?: any) => this.warn(message, data, module),
      error: (message: string, data?: any) => this.error(message, data, module),
    };
  }
}

// 创建全局 logger 实例
export const logger = new Logger();

// 创建模块化的 logger
export const createLogger = (module: string) => logger.createModuleLogger(module);

export { Logger };

export default logger;
