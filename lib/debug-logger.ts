// Debug logger for tracking API calls and AI responses

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'api_call' | 'api_response' | 'ai_request' | 'ai_response' | 'tool_call' | 'tool_response' | 'error' | 'info';
  source: string;
  message: string;
  data?: unknown;
  duration?: number; // in ms
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();
  private maxLogs = 100;

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  log(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const fullEntry: LogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date(),
    };

    this.logs.unshift(fullEntry); // Add to beginning (newest first)
    
    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Notify listeners
    this.notifyListeners();

    // Also log to console for debugging
    const timeStr = fullEntry.timestamp.toISOString().split('T')[1].slice(0, 12);
    console.log(`[${timeStr}] [${fullEntry.type}] ${fullEntry.source}: ${fullEntry.message}`, fullEntry.data || '');

    return fullEntry;
  }

  apiCall(source: string, message: string, data?: unknown): LogEntry {
    return this.log({ type: 'api_call', source, message, data });
  }

  apiResponse(source: string, message: string, data?: unknown, duration?: number): LogEntry {
    return this.log({ type: 'api_response', source, message, data, duration });
  }

  aiRequest(source: string, message: string, data?: unknown): LogEntry {
    return this.log({ type: 'ai_request', source, message, data });
  }

  aiResponse(source: string, message: string, data?: unknown, duration?: number): LogEntry {
    return this.log({ type: 'ai_response', source, message, data, duration });
  }

  error(source: string, message: string, data?: unknown): LogEntry {
    return this.log({ type: 'error', source, message, data });
  }

  info(source: string, message: string, data?: unknown): LogEntry {
    return this.log({ type: 'info', source, message, data });
  }

  toolCall(source: string, toolName: string, data?: unknown): LogEntry {
    return this.log({ type: 'tool_call', source, message: `Tool: ${toolName}`, data });
  }

  toolResponse(source: string, toolName: string, data?: unknown, duration?: number): LogEntry {
    return this.log({ type: 'tool_response', source, message: `Tool: ${toolName} completed`, data, duration });
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    // Immediately call with current logs
    listener(this.getLogs());
    // Return unsubscribe function
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const currentLogs = this.getLogs();
    this.listeners.forEach(listener => listener(currentLogs));
  }
}

// Singleton instance
export const debugLogger = new DebugLogger();

// Helper to measure API call duration
export function withTiming<T>(
  fn: () => Promise<T>,
  source: string,
  callMessage: string,
  responseMessage: string
): Promise<T> {
  const startTime = Date.now();
  debugLogger.apiCall(source, callMessage);
  
  return fn().then(
    (result) => {
      const duration = Date.now() - startTime;
      debugLogger.apiResponse(source, responseMessage, undefined, duration);
      return result;
    },
    (error) => {
      const duration = Date.now() - startTime;
      debugLogger.error(source, `Error: ${error.message}`, { duration });
      throw error;
    }
  );
}

