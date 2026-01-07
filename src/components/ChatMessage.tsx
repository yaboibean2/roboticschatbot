import { Waves, User } from "lucide-react";
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

  // Parse follow-up questions from content and remove them from displayed text
  const parseFollowUps = (text: string) => {
    // Preferred format (hidden from display):
    // [followups]
    // - Question 1
    // - Question 2
    // - Question 3
    // [/followups]
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

    // Backward-compatible (older model output)
    const legacyMatch = text.match(/---\s*\n?\*\*You might ask:\*\*\s*([\s\S]*?)$/);
    if (legacyMatch) {
      const mainContent = text.replace(/---\s*\n?\*\*You might ask:\*\*[\s\S]*$/, "").trim();
      const followUps = legacyMatch[1]
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
    <div
      className={`flex gap-4 animate-fade-in-up ${isUser ? "flex-row-reverse" : ""}`}
    >
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "gradient-primary text-primary-foreground shadow-water"
        }`}
      >
        {isUser ? <User className="w-5 h-5" /> : <Waves className="w-5 h-5" />}
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? "text-right" : ""}`}>
        {!isUser && (
          <p className="text-xs text-muted-foreground mb-1 font-medium">Dr. D</p>
        )}
        <div
          className={isUser ? "chat-bubble-user inline-block" : "chat-bubble-assistant"}
        >
          <div className="leading-relaxed prose prose-sm max-w-none prose-p:my-2 prose-strong:text-foreground prose-em:text-foreground/90">
            {isUser ? (
              <p className="whitespace-pre-wrap m-0">{content}</p>
            ) : (
              <>
                <div className="streaming-text">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
                      ul: ({ children }) => <ul className="list-disc pl-4 my-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 my-2">{children}</ol>,
                      li: ({ children }) => <li className="my-1">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground my-3">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {mainContent}
                  </ReactMarkdown>
                </div>
                {isStreaming && !content && (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-pulse" />
                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-pulse [animation-delay:150ms]" />
                    <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-pulse [animation-delay:300ms]" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {/* Follow-up questions */}
        {!isUser && followUps.length > 0 && !isStreaming && (
          <div className="mt-3 flex flex-wrap gap-2">
            {followUps.map((question, idx) => (
              <button
                key={idx}
                onClick={() => onFollowUpClick?.(question)}
                className="px-3 py-1.5 text-xs rounded-full border border-border bg-card/50 text-foreground hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200 text-left"
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
