import { Waves, Menu, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onMenuClick: () => void;
  onNewChat: () => void;
  hasMessages: boolean;
}

export function Header({ onMenuClick, onNewChat, hasMessages }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shadow-water">
          <Waves className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">The Fishbowl</h1>
          <p className="text-xs text-muted-foreground">Dr. D</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {hasMessages && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewChat}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            New Dialogue
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
