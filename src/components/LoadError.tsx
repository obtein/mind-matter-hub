import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Shown instead of an empty list when the local database could not be read. */
export const LoadError = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Card className="border-destructive/40">
    <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      <p className="text-xs text-muted-foreground">
        Veriler okunamadı; bu boş bir liste değildir. Sorun sürerse uygulamayı yeniden başlatın.
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tekrar dene
        </Button>
      )}
    </CardContent>
  </Card>
);
