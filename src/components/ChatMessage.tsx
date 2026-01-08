import { User, Bot, Image as ImageIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { memo, useState } from "react";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  onFollowUpClick?: (question: string) => void;
  pageImages?: string[];
}

export const ChatMessage = memo(function ChatMessage({ 
  role, 
  content, 
  isStreaming, 
  onFollowUpClick,
  pageImages 
}: ChatMessageProps) {
  const isUser = role === "user";
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

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

  // Filter out failed images
  const validImages = pageImages?.filter(url => !failedImages.has(url)) || [];

  const handleImageError = (url: string) => {
    setFailedImages(prev => new Set(prev).add(url));
  };

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
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic bg-primary/5 py-1 rounded-r">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {mainContent}
                  </ReactMarkdown>
                </div>
                {isStreaming && !content && (
                  <div className="flex items-center gap-1.5 py-1 text-muted-foreground">
                    <span className="text-sm animate-pulse">Thinking</span>
                    <span className="flex gap-0.5">
                      <span className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1 h-1 bg-current rounded-full animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        
        {/* Page images */}
        {!isUser && validImages.length > 0 && !isStreaming && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Referenced pages from the manual</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {validImages.map((url, idx) => {
                const pageMatch = url.match(/page_(\d+)\.jpg/);
                const pageNum = pageMatch ? pageMatch[1] : idx + 1;
                
                return (
                  <button
                    key={url}
                    onClick={() => setExpandedImage(expandedImage === url ? null : url)}
                    className="relative group"
                  >
                    <img
                      src={url}
                      alt={`Page ${pageNum}`}
                      className="w-24 h-32 object-cover rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer"
                      onError={() => handleImageError(url)}
                    />
                    <div className="absolute bottom-1 left-1 bg-background/80 backdrop-blur-sm text-xs px-1.5 py-0.5 rounded">
                      Page {pageNum}
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Expanded image view */}
            {expandedImage && (
              <div 
                className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setExpandedImage(null)}
              >
                <div className="relative max-w-4xl max-h-[90vh] overflow-auto">
                  <img
                    src={expandedImage}
                    alt="Expanded page"
                    className="rounded-lg shadow-2xl max-w-full max-h-[85vh] object-contain"
                  />
                  <button
                    onClick={() => setExpandedImage(null)}
                    className="absolute top-2 right-2 bg-background/90 text-foreground rounded-full p-2 hover:bg-background transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
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
