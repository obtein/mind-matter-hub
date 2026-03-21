import { useState, useEffect } from "react";
import { useDb } from "@/services/ServiceContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns";
import { tr } from "date-fns/locale";

interface MonthlyCalendarProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
}

interface DayAppointmentCount {
  [key: string]: number;
}

export const MonthlyCalendar = ({ selectedDate, onDateSelect }: MonthlyCalendarProps) => {
  const db = useDb();
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(selectedDate));
  const [appointmentCounts, setAppointmentCounts] = useState<DayAppointmentCount>({});

  useEffect(() => {
    fetchMonthlyAppointments();
  }, [currentMonth]);

  const fetchMonthlyAppointments = async () => {
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const dates = await db.getMonthlyAppointmentDates(monthStart.toISOString(), monthEnd.toISOString());
      const counts: DayAppointmentCount = {};
      dates.forEach((dateStr) => {
        const dateKey = format(new Date(dateStr), "yyyy-MM-dd");
        counts[dateKey] = (counts[dateKey] || 0) + 1;
      });
      setAppointmentCounts(counts);
    } catch (error) {
      console.error("Aylık randevular yüklenemedi:", error);
    }
  };

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToCurrentMonth = () => setCurrentMonth(startOfMonth(new Date()));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const isCurrentMonth = isSameMonth(currentMonth, new Date());

  const getDayColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    if (count <= 3) return "bg-green-500/20 dark:bg-green-500/30";
    if (count <= 7) return "bg-yellow-500/20 dark:bg-yellow-500/30";
    return "bg-red-500/20 dark:bg-red-500/30";
  };

  const getDayBorderColor = (count: number) => {
    if (count === 0) return "border-transparent";
    if (count <= 3) return "border-green-500";
    if (count <= 7) return "border-yellow-500";
    return "border-red-500";
  };

  const weekDays = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  return (
    <div className="bg-card rounded-xl p-4 shadow-soft border">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPreviousMonth}
          className="h-8 w-8"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-3">
          <h3 className="text-lg font-display font-semibold">
            {format(currentMonth, "MMMM yyyy", { locale: tr })}
          </h3>
          {!isCurrentMonth && (
            <Button variant="outline" size="sm" onClick={goToCurrentMonth} className="h-7 text-xs">
              Bu Ay
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
          className="h-8 w-8"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Week Days Header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekDays.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const count = appointmentCounts[dateKey] || 0;
          const isCurrentMonthDay = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={dateKey}
              onClick={() => onDateSelect(day)}
              className={`
                relative p-2 rounded-lg text-sm transition-all
                ${isCurrentMonthDay ? "" : "opacity-30"}
                ${getDayColor(isCurrentMonthDay ? count : 0)}
                ${isSelected ? `ring-2 ring-primary ${getDayBorderColor(count)}` : ""}
                ${isToday && !isSelected ? "ring-1 ring-primary/50" : ""}
                hover:bg-accent/50
                border-l-2 ${isCurrentMonthDay ? getDayBorderColor(count) : "border-transparent"}
              `}
            >
              <span className={`font-medium ${isToday ? "text-primary" : ""}`}>
                {format(day, "d")}
              </span>
              {isCurrentMonthDay && count > 0 && (
                <span className={`
                  absolute bottom-0.5 right-0.5 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center
                  ${count <= 3 ? "bg-green-500 text-white" : count <= 7 ? "bg-yellow-500 text-white" : "bg-red-500 text-white"}
                `}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500/30 border-l-2 border-green-500"></div>
          <span>0-3</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500/30 border-l-2 border-yellow-500"></div>
          <span>4-7</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/30 border-l-2 border-red-500"></div>
          <span>8+</span>
        </div>
      </div>
    </div>
  );
};
