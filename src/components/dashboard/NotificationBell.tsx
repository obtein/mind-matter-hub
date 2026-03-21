import { useState, useEffect } from "react";
import { useAuth, useDb } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, Trash2, Calendar, AlertCircle, Info, CheckCircle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { toast } from "sonner";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  related_appointment_id: string | null;
  related_patient_id: string | null;
}

export const NotificationBell = () => {
  const auth = useAuth();
  const db = useDb();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
    checkUpcomingAppointments();

    const sub = db.subscribeToNotifications(() => fetchNotifications());

    return () => {
      sub.unsubscribe();
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const data = await db.getNotifications(20);
      setNotifications(data || []);
      setUnreadCount(data?.filter((n) => !n.is_read).length || 0);
    } catch {
      // Silent - notifications are non-critical
    } finally {
      setLoading(false);
    }
  };

  const checkUpcomingAppointments = async () => {
    try {
      const user = await auth.getUser();
      if (!user) return;

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const appointments = await db.getUpcomingAppointments(now.toISOString(), tomorrow.toISOString());

      const appointmentIds = appointments?.map((a) => a.id) || [];
      if (appointmentIds.length === 0) return;

      const existingNotifications = await db.getNotificationsByAppointmentIds(appointmentIds);

      const existingAppointmentIds = new Set(
        existingNotifications?.map((n) => n.related_appointment_id) || []
      );

      for (const apt of appointments || []) {
        if (!existingAppointmentIds.has(apt.id)) {
          const patientName = apt.patients?.full_name || "Hasta";
          const aptTime = format(new Date(apt.appointment_date), "HH:mm", { locale: tr });
          const aptDate = format(new Date(apt.appointment_date), "d MMMM", { locale: tr });

          await db.createNotification({
            user_id: user.id,
            title: "Yaklaşan Randevu",
            message: `${patientName} - ${aptDate} saat ${aptTime}`,
            type: "reminder",
            related_appointment_id: apt.id,
          });
        }
      }

      fetchNotifications();
    } catch {
      // Silent - notification creation is non-critical
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await db.markNotificationRead(id);
      fetchNotifications();
    } catch {
      toast.error("İşlem başarısız");
    }
  };

  const markAllAsRead = async () => {
    try {
      await db.markAllNotificationsRead();
      toast.success("Tüm bildirimler okundu olarak işaretlendi");
      fetchNotifications();
    } catch {
      toast.error("İşlem başarısız");
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await db.deleteNotification(id);
      fetchNotifications();
    } catch {
      toast.error("Bildirim silinemedi");
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "reminder":
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <Info className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Bildirimler</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <Check className="w-4 h-4 mr-1" />
              Tümünü Oku
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Bildirim yok</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 hover:bg-muted/50 transition-colors ${
                    !notification.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getTypeIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm font-medium truncate ${!notification.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                          {notification.title}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notification.is_read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-6 h-6 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: tr,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
