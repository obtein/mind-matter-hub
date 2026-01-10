/**
 * Maps database errors to user-friendly messages
 * Prevents leaking internal database schema information
 */
export function mapDatabaseError(error: any): string {
  // Log full error for debugging (will be visible in console only)
  console.error("Database error:", error?.code, error?.message);

  // PostgreSQL error codes
  if (error?.code === "23503") {
    return "İlişkili kayıt bulunamadı";
  }

  if (error?.code === "23505") {
    return "Bu kayıt zaten mevcut";
  }

  if (error?.code === "23502") {
    return "Zorunlu alanlar eksik";
  }

  if (error?.code === "22P02") {
    return "Geçersiz veri formatı";
  }

  // RLS policy violations
  if (error?.message?.includes("row-level security")) {
    return "Bu işlem için yetkiniz yok";
  }

  if (error?.message?.includes("violates foreign key")) {
    return "İlişkili kayıt bulunamadı";
  }

  if (error?.message?.includes("violates unique constraint")) {
    return "Bu kayıt zaten mevcut";
  }

  if (error?.message?.includes("violates check constraint")) {
    return "Girilen değerler geçersiz";
  }

  // Network errors
  if (error?.message?.includes("Failed to fetch") || error?.message?.includes("NetworkError")) {
    return "Bağlantı hatası. Lütfen internet bağlantınızı kontrol edin.";
  }

  // Authentication errors
  if (error?.message?.includes("JWT") || error?.message?.includes("token")) {
    return "Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.";
  }

  // Generic fallback - never expose raw error messages
  return "İşlem başarısız oldu. Lütfen tekrar deneyin.";
}

/**
 * Safe error handler for async operations
 */
export function handleError(error: any, fallbackMessage?: string): string {
  if (typeof error === "string") {
    // Don't expose string errors that might contain sensitive info
    console.error("Error:", error);
    return fallbackMessage || "Bir hata oluştu";
  }

  return mapDatabaseError(error);
}
