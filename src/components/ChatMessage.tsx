import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { memo } from "react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onFollowUpClick?: (question: string) => void;
}

export const ChatMessage = memo(function ChatMessage({ role, content, isStreaming, onFollowUpClick }: ChatMessageProps) {
  const isUser = role === "user";

  // Parse follow-up questions from content
  const parseFollowUps = (text: string) => {
    const taggedMatch = text.match(/\n?\[followups\]\s*\n([\s\S]*?)\n\[\/followups\]\s*$/i);
    if (taggedMatch) {
      const mainContent = text
        .replace(/\n?\[followups\][\s\S]*?\[\/followups\]\s*$/i, "")
        .trim();

      const followUps = taggedMatch[1]
        .split("\n")
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter((line) => line.length > 0)
        .slice(0, 3);

      return { mainContent, followUps };
    }

    return { mainContent: text, followUps: [] };
  };

  const { mainContent, followUps } = isUser ? { mainContent: content, followUps: [] } : parseFollowUps(content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`flex-1 max-w-[85%] ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block text-left ${
            isUser 
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2" 
              : "bg-muted/50 text-foreground rounded-2xl rounded-bl-sm px-4 py-2"
          }`}
        >
          <div className="text-sm leading-relaxed">
            {isUser ? (
              <p className="whitespace-pre-wrap m-0">{content}</p>
            ) : (
              <>
                <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-strong:text-foreground prose-em:text-foreground/90 [&_p]:text-foreground [&_li]:text-foreground">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc pl-4 my-1.5">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5">{children}</ol>,
                      li: ({ children }) => <li className="my-0.5">{children}</li>,
                    }}
                  >
                    {mainContent}
                  </ReactMarkdown>
                </div>
                {isStreaming && !content && (
                  <div className="flex items-center gap-1 py-1">
                    <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-pulse" />
                    <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 bg-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {/* Follow-up questions */}
        {!isUser && followUps.length > 0 && !isStreaming && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {followUps.map((question, idx) => (
              <button
                key={idx}
                onClick={() => onFollowUpClick?.(question)}
                className="px-2.5 py-1 text-xs rounded-full border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
