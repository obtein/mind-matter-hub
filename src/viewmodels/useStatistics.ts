import { useState, useEffect, useMemo, useCallback } from "react";
import { useDb } from "@/services/ServiceContext";
import { PatientRepository } from "@/repositories/PatientRepository";
import { AppointmentRepository } from "@/repositories/AppointmentRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { tr } from "date-fns/locale";

export interface GenderDistributionItem {
  name: string;
  value: number;
  color: string;
}

export interface AgeDistributionItem {
  name: string;
  value: number;
}

export interface MonthlyAppointmentItem {
  month: string;
  count: number;
}

export interface Stats {
  totalPatients: number;
  totalAppointments: number;
  completedAppointments: number;
  genderDistribution: GenderDistributionItem[];
  ageDistribution: AgeDistributionItem[];
  monthlyAppointments: MonthlyAppointmentItem[];
}

const GENDER_COLORS: Record<string, string> = {
  erkek: "#3b82f6",
  kadın: "#ec4899",
  diğer: "#8b5cf6",
  belirsiz: "#6b7280",
};

export const AGE_COLORS: Record<string, string> = {
  "0-17": "#22c55e",
  "18-30": "#3b82f6",
  "31-45": "#f59e0b",
  "46-60": "#ef4444",
  "60+": "#8b5cf6",
};

function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function useStatistics() {
  const db = useDb();
  const patientRepo = useMemo(() => new PatientRepository(db), [db]);
  const appointmentRepo = useMemo(() => new AppointmentRepository(db), [db]);

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [patients, appointments] = await Promise.all([
        patientRepo.getForStats(),
        appointmentRepo.getForStats(),
      ]);

      // Calculate gender distribution
      const genderCounts: Record<string, number> = {};
      patients?.forEach((p) => {
        const gender = p.gender || "belirsiz";
        genderCounts[gender] = (genderCounts[gender] || 0) + 1;
      });

      const genderDistribution = Object.entries(genderCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        color: GENDER_COLORS[name as keyof typeof GENDER_COLORS] || GENDER_COLORS.belirsiz,
      }));

      // Calculate age distribution
      const ageGroups: Record<string, number> = {
        "0-17": 0,
        "18-30": 0,
        "31-45": 0,
        "46-60": 0,
        "60+": 0,
      };

      patients?.forEach((p) => {
        if (p.date_of_birth) {
          const age = calculateAge(p.date_of_birth);
          if (age < 18) ageGroups["0-17"]++;
          else if (age <= 30) ageGroups["18-30"]++;
          else if (age <= 45) ageGroups["31-45"]++;
          else if (age <= 60) ageGroups["46-60"]++;
          else ageGroups["60+"]++;
        }
      });

      const ageDistribution = Object.entries(ageGroups)
        .filter(([_, value]) => value > 0)
        .map(([name, value]) => ({ name, value }));

      // Calculate monthly appointments for the last 6 months
      const monthlyAppointments: MonthlyAppointmentItem[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);

        const count =
          appointments?.filter((a) => {
            const aptDate = new Date(a.appointment_date);
            return aptDate >= monthStart && aptDate <= monthEnd;
          }).length || 0;

        monthlyAppointments.push({
          month: format(monthDate, "MMM", { locale: tr }),
          count,
        });
      }

      const completedAppointments =
        appointments?.filter((a) => a.status === "completed").length || 0;

      setStats({
        totalPatients: patients?.length || 0,
        totalAppointments: appointments?.length || 0,
        completedAppointments,
        genderDistribution,
        ageDistribution,
        monthlyAppointments,
      });
    } catch (error: unknown) {
      toast.error(handleError(error, "İstatistikler yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [patientRepo, appointmentRepo]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const completionRate = useMemo(() => {
    if (!stats || stats.totalAppointments === 0) return 0;
    return Math.round((stats.completedAppointments / stats.totalAppointments) * 100);
  }, [stats]);

  return {
    // State
    stats,
    loading,
    completionRate,

    // Actions
    refresh: fetchStats,
  };
}
