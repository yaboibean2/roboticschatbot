import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Upload, Trash2, FileText, ArrowLeft, RefreshCw, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface Manual {
  id: string;
  name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
  chunk_count: number | null;
  status: string | null;
  processed_at: string | null;
}

export default function Admin() {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [processingManualId, setProcessingManualId] = useState<string | null>(null);

  const fetchManuals = async () => {
    const { data, error } = await supabase
      .from("manuals")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setManuals(data);
    }
  };

  useEffect(() => {
    fetchManuals();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }

    setIsUploading(true);
    setStatus("Uploading PDF...");

    try {
      const fileName = `${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from("manuals")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: manualData, error: insertError } = await supabase
        .from("manuals")
        .insert({
          name: file.name.replace(".pdf", ""),
          file_path: fileName,
          file_size: file.size,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success("PDF uploaded successfully!");
      setStatus("");
      fetchManuals();

      // Auto-process the uploaded manual
      if (manualData) {
        await processManual(manualData.id, fileName);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload PDF");
      setStatus("");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const processManual = async (manualId: string, filePath: string) => {
    setIsProcessing(true);
    setProcessingManualId(manualId);
    setProgress(0);
    setStatus("Processing PDF...");

    try {
      // Get the public URL for the PDF
      const { data: urlData } = supabase.storage
        .from("manuals")
        .getPublicUrl(filePath);

      setStatus("Extracting and chunking text...");
      setProgress(20);

      // Call the ingest function
      const { data, error } = await supabase.functions.invoke("ingest-pdf", {
        body: { 
          manualId, 
          pdfUrl: urlData.publicUrl 
        },
      });

      if (error) throw error;

      setProgress(100);
      setStatus(`Done! Processed ${data?.chunks || 0} chunks.`);
      toast.success("Manual processed successfully!");
    } catch (error) {
      console.error("Processing error:", error);
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error("Failed to process manual");
    } finally {
      setIsProcessing(false);
      setProcessingManualId(null);
    }
  };

  const handleDelete = async (manual: Manual) => {
    if (!confirm(`Delete "${manual.name}"?`)) return;

    try {
      // Delete from storage
      await supabase.storage.from("manuals").remove([manual.file_path]);

      // Delete from database (cascades to chunks)
      const { error } = await supabase
        .from("manuals")
        .delete()
        .eq("id", manual.id);

      if (error) throw error;

      toast.success("Manual deleted");
      fetchManuals();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete manual");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string | null, chunkCount: number | null) => {
    switch (status) {
      case "ready":
        return (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle className="w-3 h-3 mr-1" />
            {chunkCount} chunks
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case "error":
        return (
          <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const handleReprocess = async (manual: Manual) => {
    await processManual(manual.id, manual.file_path);
  };

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Manage Manuals</h1>
            <p className="text-sm text-muted-foreground">
              Upload game manuals for Q&A
            </p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="p-4 border border-border rounded-lg bg-card">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              disabled={isUploading || isProcessing}
              className="hidden"
              id="pdf-upload"
            />
            <label htmlFor="pdf-upload">
              <Button asChild disabled={isUploading || isProcessing}>
                <span className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Uploading..." : "Upload PDF"}
                </span>
              </Button>
            </label>
            {status && (
              <span className="text-sm text-muted-foreground">{status}</span>
            )}
          </div>

          {isProcessing && (
            <div className="mt-4">
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>

        {/* Manuals List */}
        <div className="space-y-2">
          {manuals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No manuals uploaded yet</p>
            </div>
          ) : (
            manuals.map((manual) => (
              <div
                key={manual.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg bg-card"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {manual.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(manual.file_size)}
                    </p>
                  </div>
                  {getStatusBadge(manual.status, manual.chunk_count)}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {processingManualId === manual.id ? (
                    <span className="text-xs text-muted-foreground">Processing...</span>
                  ) : (
                    <>
                      {(manual.status === "error" || manual.status === "pending") && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReprocess(manual)}
                          title="Reprocess"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(manual)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
