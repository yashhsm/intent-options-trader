"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bug,
  Trash2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Bot,
  AlertCircle,
  Info,
} from "lucide-react";
import { debugLogger, type LogEntry } from "@/lib/debug-logger";

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function LogIcon({ type }: { type: LogEntry['type'] }) {
  switch (type) {
    case 'api_call':
      return <ArrowRight className="h-3 w-3 text-blue-400" />;
    case 'api_response':
      return <ArrowLeft className="h-3 w-3 text-green-400" />;
    case 'ai_request':
      return <Bot className="h-3 w-3 text-purple-400" />;
    case 'ai_response':
      return <Bot className="h-3 w-3 text-emerald-400" />;
    case 'tool_call':
      return <ArrowRight className="h-3 w-3 text-amber-400" />;
    case 'tool_response':
      return <ArrowLeft className="h-3 w-3 text-amber-400" />;
    case 'error':
      return <AlertCircle className="h-3 w-3 text-red-400" />;
    case 'info':
    default:
      return <Info className="h-3 w-3 text-zinc-400" />;
  }
}

function LogTypeBadge({ type }: { type: LogEntry['type'] }) {
  const styles: Record<LogEntry['type'], string> = {
    api_call: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    api_response: 'bg-green-500/20 text-green-400 border-green-500/30',
    ai_request: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    ai_response: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    tool_call: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    tool_response: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };

  const labels: Record<LogEntry['type'], string> = {
    api_call: 'API →',
    api_response: 'API ←',
    ai_request: 'AI →',
    ai_response: 'AI ←',
    tool_call: 'TOOL →',
    tool_response: 'TOOL ←',
    error: 'ERROR',
    info: 'INFO',
  };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${styles[type]}`}>
      {labels[type]}
    </Badge>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border-b border-zinc-800/50 py-2 px-1 hover:bg-zinc-800/30 cursor-pointer transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <LogIcon type={entry.type} />
          <span className="text-[10px] font-mono text-zinc-500">
            {formatTime(entry.timestamp)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <LogTypeBadge type={entry.type} />
            <span className="text-xs font-medium text-zinc-300 truncate">
              {entry.source}
            </span>
            {entry.duration !== undefined && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {entry.duration}ms
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            {entry.message}
          </p>
        </div>
      </div>
      
      {expanded && entry.data && (
        <div className="mt-2 ml-6">
          <pre className="text-[10px] text-zinc-500 bg-zinc-900/50 rounded p-2 overflow-x-auto max-h-40">
            {typeof entry.data === 'string' 
              ? entry.data 
              : JSON.stringify(entry.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = debugLogger.subscribe(setLogs);
    return unsubscribe;
  }, []);

  const handleClear = () => {
    debugLogger.clear();
  };

  const apiCalls = logs.filter(l => l.type === 'api_call' || l.type === 'api_response').length;
  const aiCalls = logs.filter(l => l.type === 'ai_request' || l.type === 'ai_response').length;
  const toolCalls = logs.filter(l => l.type === 'tool_call' || l.type === 'tool_response').length;
  const errors = logs.filter(l => l.type === 'error').length;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 right-4 z-50 border-zinc-700 bg-zinc-900/90 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 backdrop-blur-sm shadow-lg"
        >
          <Bug className="h-4 w-4 mr-2" />
          Debug
          {logs.length > 0 && (
            <Badge variant="secondary" className="ml-2 bg-zinc-700 text-zinc-300">
              {logs.length}
            </Badge>
          )}
          {errors > 0 && (
            <Badge variant="destructive" className="ml-1">
              {errors}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="right" 
        className="w-[400px] sm:w-[500px] bg-zinc-900 border-zinc-800 p-0"
      >
        <SheetHeader className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-zinc-100">Debug Logs</SheetTitle>
              <SheetDescription className="text-zinc-500">
                API calls, AI responses, and tool executions with timestamps
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Stats */}
          <div className="flex gap-3 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-blue-400" />
              <span className="text-xs text-zinc-400">API: {apiCalls}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-purple-400" />
              <span className="text-xs text-zinc-400">AI: {aiCalls}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-xs text-zinc-400">Tools: {toolCalls}</span>
            </div>
            {errors > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-xs text-red-400">Errors: {errors}</span>
              </div>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-140px)]">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
              <Bug className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No logs yet</p>
              <p className="text-xs">Start a trade to see activity</p>
            </div>
          ) : (
            <div>
              {logs.map((entry) => (
                <LogEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

