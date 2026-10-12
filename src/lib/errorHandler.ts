/**
 * Maps database errors to user-friendly messages
 * Prevents leaking internal database schema information
 */
interface DbErrorLike {
  code?: string;
  message?: string;
}

function asDbError(error: unknown): DbErrorLike {
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      message: typeof e.message === "string" ? e.message : undefined,
    };
  }
  return {};
}

export function mapDatabaseError(error: unknown): string {
  const e = asDbError(error);

  // PostgreSQL error codes
  if (e.code === "23503") {
    return "İlişkili kayıt bulunamadı";
  }

  if (e.code === "23505") {
    return "Bu kayıt zaten mevcut";
  }

  if (e.code === "23502") {
    return "Zorunlu alanlar eksik";
  }

  if (e.code === "22P02") {
    return "Geçersiz veri formatı";
  }

  if (e.message?.includes("violates foreign key")) {
    return "İlişkili kayıt bulunamadı";
  }

  if (e.message?.includes("violates unique constraint")) {
    return "Bu kayıt zaten mevcut";
  }

  if (e.message?.includes("violates check constraint")) {
    return "Girilen değerler geçersiz";
  }

  // Generic fallback - never expose raw error messages
  return "İşlem başarısız oldu. Lütfen tekrar deneyin.";
}

/**
 * Safe error handler for async operations
 */
export function handleError(error: unknown, fallbackMessage?: string): string {
  if (typeof error === "string") {
    return fallbackMessage || "Bir hata oluştu";
  }

  return mapDatabaseError(error);
}
