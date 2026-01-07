import { RotateCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ManualSelector } from "./ManualSelector";

interface HeaderProps {
  onNewChat: () => void;
  hasMessages: boolean;
  selectedManualId: string | null;
  onSelectManual: (id: string | null) => void;
}

export function Header({ onNewChat, hasMessages, selectedManualId, onSelectManual }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
      <ManualSelector 
        selectedManualId={selectedManualId} 
        onSelectManual={onSelectManual} 
      />
      
      <div className="flex items-center gap-2">
        {hasMessages && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewChat}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
        <Link to="/admin">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}
