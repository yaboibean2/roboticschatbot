import { useState, useRef, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { useChat } from "@/hooks/useChat";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [selectedManualId, setSelectedManualId] = useState<string | null>(null);
  const [manualName, setManualName] = useState<string>("");
  const { messages, isLoading, sendMessage, clearMessages } = useChat(selectedManualId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll state
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const lastScrollTopRef = useRef(0);

  // Fetch manual name when selected
  useEffect(() => {
    const fetchManualName = async () => {
      if (!selectedManualId) {
        setManualName("");
        return;
      }
      const { data } = await supabase
        .from("manuals")
        .select("name")
        .eq("id", selectedManualId)
        .single();
      
      if (data) {
        setManualName(data.name);
      }
    };
    fetchManualName();
  }, [selectedManualId]);

  // Clear messages when manual changes
  const handleManualChange = useCallback((id: string | null) => {
    setSelectedManualId(id);
    clearMessages();
  }, [clearMessages]);

  // Check if scrolled to bottom
  const isAtBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const threshold = 50;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Handle user scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const currentScrollTop = container.scrollTop;
    const scrolledUp = currentScrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;

    if (scrolledUp && isLoading) {
      setAutoScrollEnabled(false);
      setShowJumpButton(true);
      return;
    }
    
    if (isAtBottom()) {
      setAutoScrollEnabled(true);
      setShowJumpButton(false);
    }
  }, [isAtBottom, isLoading]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (autoScrollEnabled && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, autoScrollEnabled]);

  // Re-enable auto-scroll when a new message is sent
  useEffect(() => {
    if (isLoading) {
      setAutoScrollEnabled(true);
      setShowJumpButton(false);
    }
  }, [isLoading]);

  // Update jump button visibility when streaming ends
  useEffect(() => {
    if (!isLoading && isAtBottom()) {
      setShowJumpButton(false);
    }
  }, [isLoading, isAtBottom]);

  const jumpToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setAutoScrollEnabled(true);
    setShowJumpButton(false);
  }, []);

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header
        onNewChat={clearMessages}
        hasMessages={messages.length > 0}
        selectedManualId={selectedManualId}
        onSelectManual={handleManualChange}
      />

      <main className="flex-1 overflow-hidden flex flex-col relative">
        {messages.length === 0 ? (
          <WelcomeScreen 
            onSuggestionClick={handleSuggestionClick} 
            manualName={manualName}
          />
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-6"
          >
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  role={message.role}
                  content={message.content}
                  pageImages={message.pageImages}
                  isStreaming={
                    isLoading &&
                    index === messages.length - 1 &&
                    message.role === "assistant"
                  }
                  onFollowUpClick={handleSuggestionClick}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Jump to bottom button */}
        {showJumpButton && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        <div className="px-4 pb-4 pt-2">
          <div className="max-w-2xl mx-auto">
            <ChatInput 
              onSend={sendMessage} 
              disabled={isLoading || !selectedManualId} 
              placeholder={selectedManualId ? "Ask about the game manual..." : "Select a manual first"}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
