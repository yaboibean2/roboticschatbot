import { Waves } from "lucide-react";

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "What is a felt experience?",
  "How do I create a dichotomy?",
  "What is informational obesity?",
  "How does the Fishbowl method work?",
];

export function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 py-12">
      {/* Fishbowl Icon */}
      <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-water mb-8">
        <Waves className="w-10 h-10 text-primary-foreground" />
      </div>

      {/* Welcome */}
      <h1 className="text-3xl md:text-4xl font-serif font-semibold text-foreground mb-3 text-center">
        The Fishbowl
      </h1>
      
      <p className="text-muted-foreground text-base mb-8">
        Learn to create meaning through felt experience.
      </p>

      {/* Suggestions */}
      <div className="flex flex-wrap justify-center gap-3">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestionClick(suggestion)}
            className="px-4 py-2 rounded-full border border-border bg-card/50 text-sm text-foreground hover:bg-accent hover:border-accent-foreground/20 transition-all duration-200"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
