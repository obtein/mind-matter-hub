/**
 * Maps database errors to user-friendly messages
 * Prevents leaking internal database schema information
 */
export function mapDatabaseError(error: any): string {
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

  if (error?.message?.includes("violates foreign key")) {
    return "İlişkili kayıt bulunamadı";
  }

  if (error?.message?.includes("violates unique constraint")) {
    return "Bu kayıt zaten mevcut";
  }

  if (error?.message?.includes("violates check constraint")) {
    return "Girilen değerler geçersiz";
  }

  // Generic fallback - never expose raw error messages
  return "İşlem başarısız oldu. Lütfen tekrar deneyin.";
}

/**
 * Safe error handler for async operations
 */
export function handleError(error: any, fallbackMessage?: string): string {
  if (typeof error === "string") {
    return fallbackMessage || "Bir hata oluştu";
  }

  return mapDatabaseError(error);
}
