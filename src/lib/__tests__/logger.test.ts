import { logger, Logger, LogLevel, createLogger } from '@/lib/logger';

describe('Logger', () => {
  beforeEach(() => {
    // 清空日志
    logger.clearLogs();
    // Mock console methods
    jest.spyOn(console, 'debug').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should log DEBUG messages', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      testLogger.debug('Debug message', { data: 'test' });
      const logs = testLogger.getLogs();
      
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.DEBUG);
      expect(logs[0].message).toBe('Debug message');
      expect(logs[0].data).toEqual({ data: 'test' });
    });

    it('should log INFO messages', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      testLogger.info('Info message');
      const logs = testLogger.getLogs();
      
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.INFO);
      expect(logs[0].message).toBe('Info message');
    });

    it('should log WARN messages', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      testLogger.warn('Warning message');
      const logs = testLogger.getLogs();
      
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[0].message).toBe('Warning message');
    });

    it('should log ERROR messages', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      testLogger.error('Error message', { error: 'details' });
      const logs = testLogger.getLogs();
      
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
      expect(logs[0].message).toBe('Error message');
      expect(logs[0].data).toEqual({ error: 'details' });
    });
  });

  describe('log filtering', () => {
    it('should respect log level filtering', () => {
      // Set level to WARN, so DEBUG and INFO should be filtered
      const warnLogger = new Logger({ level: LogLevel.WARN, enableConsole: false });
      
      warnLogger.debug('Debug');
      warnLogger.info('Info');
      warnLogger.warn('Warn');
      warnLogger.error('Error');
      
      const logs = warnLogger.getLogs();
      
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[1].level).toBe(LogLevel.ERROR);
    });
  });

  describe('module logger', () => {
    it('should create a module logger', () => {
      const baseLogger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      const moduleLogger = baseLogger.createModuleLogger('TestModule');
      
      moduleLogger.info('Module message');
      const logs = baseLogger.getLogs();
      
      expect(logs).toHaveLength(1);
      expect(logs[0].module).toBe('TestModule');
      expect(logs[0].message).toBe('Module message');
    });
  });

  describe('log limits', () => {
    it('should limit the number of logs', () => {
      const limitedLogger = new Logger({ maxLogs: 3, enableConsole: false, level: LogLevel.DEBUG });
      
      limitedLogger.info('Log 1');
      limitedLogger.info('Log 2');
      limitedLogger.info('Log 3');
      limitedLogger.info('Log 4');
      
      const logs = limitedLogger.getLogs();
      
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Log 2');
      expect(logs[1].message).toBe('Log 3');
      expect(logs[2].message).toBe('Log 4');
    });
  });

  describe('clear logs', () => {
    it('should clear all logs', () => {
      const testLogger = new Logger({ level: LogLevel.DEBUG, enableConsole: false });
      testLogger.info('Message 1');
      testLogger.info('Message 2');
      
      expect(testLogger.getLogs()).toHaveLength(2);
      
      testLogger.clearLogs();
      
      expect(testLogger.getLogs()).toHaveLength(0);
    });
  });

  describe('console output', () => {
    it('should output to console when enabled', () => {
      const consoleLogger = new Logger({ enableConsole: true, level: LogLevel.DEBUG });
      
      consoleLogger.info('Console message');
      
      expect(console.info).toHaveBeenCalled();
    });

    it('should not output to console when disabled', () => {
      const noConsoleLogger = new Logger({ enableConsole: false, level: LogLevel.DEBUG });
      
      noConsoleLogger.info('No console message');
      
      expect(console.info).not.toHaveBeenCalled();
    });
  });
});
