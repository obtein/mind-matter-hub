import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export const OfflineIndicator = () => {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg shadow-lg animate-pulse">
      <WifiOff className="w-4 h-4" />
      <span className="text-sm font-medium">Çevrimdışı — Veriler lokal olarak saklanıyor</span>
    </div>
  );
};
