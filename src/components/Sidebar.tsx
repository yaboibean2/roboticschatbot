import { X, Waves } from "lucide-react";
import { Link } from "react-router-dom";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const concepts = [
  "Opening Structure",
  "Word Pool",
  "Dichotomy",
  "Felt Experience",
  "Deconstruction",
  "Multiplicity",
];

const phrases = [
  "Google this.",
  "That's an ouch.",
  "Give a felt experience.",
  "Take it further.",
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-card border-l border-border shadow-xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Waves className="w-5 h-5 text-primary" />
              <span className="font-serif font-medium text-foreground">Concepts</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Core Concepts */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Core Concepts
              </h3>
              <div className="space-y-1">
                {concepts.map((concept) => (
                  <div
                    key={concept}
                    className="px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary/50 transition-colors cursor-pointer"
                  >
                    {concept}
                  </div>
                ))}
              </div>
            </div>

            {/* Dr. D's Phrases */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Dr. D's Phrases
              </h3>
              <div className="space-y-1">
                {phrases.map((phrase) => (
                  <div
                    key={phrase}
                    className="px-3 py-2 rounded-lg text-sm italic text-muted-foreground font-serif"
                  >
                    "{phrase}"
                  </div>
                ))}
              </div>
            </div>

            {/* Tools */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Tools
              </h3>
              <Link
                to="/admin"
                onClick={onClose}
                className="block px-3 py-2 rounded-lg text-sm text-foreground hover:bg-secondary/50 transition-colors"
              >
                Knowledge Base Admin
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

