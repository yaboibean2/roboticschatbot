import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Manual {
  id: string;
  name: string;
}

// Format manual name to "2024--crescendo" style
const formatManualName = (name: string): string => {
  // Try to extract year and game name from filename
  const yearMatch = name.match(/20\d{2}/);
  const year = yearMatch ? yearMatch[0] : "";
  
  // Common game names to look for
  const gameNames: Record<string, string> = {
    "crescendo": "crescendo",
    "reefscape": "reefscape",
  };
  
  const lowerName = name.toLowerCase();
  for (const [key, display] of Object.entries(gameNames)) {
    if (lowerName.includes(key)) {
      return year ? `${year}--${display}` : display;
    }
  }
  
  // Fallback: just return original name
  return name;
};

interface ManualSelectorProps {
  selectedManualId: string | null;
  onSelectManual: (id: string | null) => void;
}

export function ManualSelector({ selectedManualId, onSelectManual }: ManualSelectorProps) {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchManuals = async () => {
      const { data, error } = await supabase
        .from("manuals")
        .select("id, name")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setManuals(data);
        // Auto-select first manual if none selected
        if (!selectedManualId && data.length > 0) {
          onSelectManual(data[0].id);
        }
      }
      setLoading(false);
    };

    fetchManuals();
  }, [selectedManualId, onSelectManual]);

  const selectedManual = manuals.find((m) => m.id === selectedManualId);

  if (loading) {
    return null;
  }

  if (manuals.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No manuals uploaded yet
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card/50 text-sm text-foreground hover:bg-accent/50 transition-colors">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="max-w-[200px] truncate">
          {selectedManual ? formatManualName(selectedManual.name) : "Select Manual"}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {manuals.map((manual) => (
          <DropdownMenuItem
            key={manual.id}
            onClick={() => onSelectManual(manual.id)}
            className={selectedManualId === manual.id ? "bg-accent" : ""}
          >
            <FileText className="w-4 h-4 mr-2" />
            <span className="truncate">{formatManualName(manual.name)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
