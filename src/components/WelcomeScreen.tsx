import { FileText } from "lucide-react";

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  manualName?: string;
}

const suggestions = [
  "What are the game rules?",
  "How do scoring zones work?",
  "What are the robot size limits?",
  "Explain autonomous period",
];

export function WelcomeScreen({ onSuggestionClick, manualName }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-12">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <FileText className="w-8 h-8 text-primary" />
      </div>

      {/* Welcome */}
      <h1 className="text-2xl md:text-3xl font-semibold text-foreground mb-2 text-center">
        Game Manual Q&A
      </h1>
      
      <p className="text-primary font-medium text-sm mb-2 text-center">
        FRC Team 4990 • Basement Bots
      </p>
      
      <p className="text-muted-foreground text-sm mb-8 text-center max-w-md">
        {manualName 
          ? `Ask questions about "${manualName}"`
          : "Select a game manual to get started"}
      </p>

      {/* Suggestions */}
      {manualName && (
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => onSuggestionClick(suggestion)}
              className="px-3 py-1.5 rounded-full border border-border bg-card/50 text-sm text-foreground hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
