import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Calendar, TrendingUp, UserCheck, Loader2 } from "lucide-react";
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
import { useStatistics, AGE_COLORS } from "@/viewmodels/useStatistics";

export const StatisticsView = () => {
  const vm = useStatistics();

  if (vm.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!vm.stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        İstatistikler yüklenemedi
      </div>
    );
  }

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
            <div className="text-3xl font-bold">{vm.stats.totalPatients}</div>
            <p className="text-xs text-muted-foreground mt-1">kayıtlı hasta</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Randevu</CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{vm.stats.totalAppointments}</div>
            <p className="text-xs text-muted-foreground mt-1">tüm zamanlar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tamamlanan</CardTitle>
            <UserCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{vm.stats.completedAppointments}</div>
            <p className="text-xs text-muted-foreground mt-1">seans tamamlandı</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tamamlanma Oranı</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">%{vm.completionRate}</div>
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
                <BarChart data={vm.stats.monthlyAppointments}>
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
              {vm.stats.genderDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={vm.stats.genderDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      labelLine={true}
                      label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`}
                    >
                      {vm.stats.genderDistribution.map((entry, index) => (
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
            {vm.stats.ageDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vm.stats.ageDistribution} layout="vertical">
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
                    {vm.stats.ageDistribution.map((entry) => (
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
