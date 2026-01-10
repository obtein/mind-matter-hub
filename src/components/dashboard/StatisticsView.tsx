import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Users, Calendar, TrendingUp, UserCheck, Loader2 } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { tr } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface Stats {
  totalPatients: number;
  totalAppointments: number;
  completedAppointments: number;
  genderDistribution: { name: string; value: number; color: string }[];
  ageDistribution: { name: string; value: number }[];
  monthlyAppointments: { month: string; count: number }[];
}

const GENDER_COLORS: Record<string, string> = {
  erkek: "#3b82f6",    // Blue
  kadın: "#ec4899",    // Pink
  diğer: "#8b5cf6",    // Purple
  belirsiz: "#6b7280", // Gray
};

const AGE_COLORS: Record<string, string> = {
  "0-17": "#22c55e",   // Green - children
  "18-30": "#3b82f6",  // Blue - young adults
  "31-45": "#f59e0b",  // Amber - adults
  "46-60": "#ef4444",  // Red - middle age
  "60+": "#8b5cf6",    // Purple - seniors
};

export const StatisticsView = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch patients
      const { data: patients, error: patientsError } = await supabase
        .from("patients")
        .select("id, gender, date_of_birth");

      if (patientsError) throw patientsError;

      // Fetch appointments
      const { data: appointments, error: appointmentsError } = await supabase
        .from("appointments")
        .select("id, appointment_date, status");

      if (appointmentsError) throw appointmentsError;

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
      const monthlyAppointments: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);

        const count = appointments?.filter((a) => {
          const aptDate = new Date(a.appointment_date);
          return aptDate >= monthStart && aptDate <= monthEnd;
        }).length || 0;

        monthlyAppointments.push({
          month: format(monthDate, "MMM", { locale: tr }),
          count,
        });
      }

      const completedAppointments = appointments?.filter((a) => a.status === "completed").length || 0;

      setStats({
        totalPatients: patients?.length || 0,
        totalAppointments: appointments?.length || 0,
        completedAppointments,
        genderDistribution,
        ageDistribution,
        monthlyAppointments,
      });
    } catch (error: any) {
      toast.error("İstatistikler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dateOfBirth: string): number => {
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        İstatistikler yüklenemedi
      </div>
    );
  }

  const completionRate = stats.totalAppointments > 0 
    ? Math.round((stats.completedAppointments / stats.totalAppointments) * 100) 
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">İstatistikler</h1>
        <p className="text-muted-foreground">Terapi merkezi performans raporu</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Hasta</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalPatients}</div>
            <p className="text-xs text-muted-foreground mt-1">kayıtlı hasta</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Randevu</CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalAppointments}</div>
            <p className="text-xs text-muted-foreground mt-1">tüm zamanlar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tamamlanan</CardTitle>
            <UserCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.completedAppointments}</div>
            <p className="text-xs text-muted-foreground mt-1">seans tamamlandı</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tamamlanma Oranı</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">%{completionRate}</div>
            <p className="text-xs text-muted-foreground mt-1">başarı oranı</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Appointments Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Aylık Randevu Trendi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyAppointments}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }} 
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Randevu" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gender Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cinsiyet Dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {stats.genderDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.genderDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={true}
                      label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`}
                    >
                      {stats.genderDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                      formatter={(value: number, name: string) => [`${value} hasta`, name]}
                    />
                    <Legend 
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-sm font-medium">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Veri yok
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Age Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Yaş Grupları Dağılımı</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {stats.ageDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.ageDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="name" type="category" className="text-xs" width={60} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--card))", 
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }} 
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Hasta Sayısı">
                    {stats.ageDistribution.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={AGE_COLORS[entry.name] || "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Yaş bilgisi girilmiş hasta yok
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
