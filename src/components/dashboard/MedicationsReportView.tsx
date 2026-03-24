import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pill, Search, User, Calendar, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useMedications } from "@/viewmodels/useMedications";

export const MedicationsReportView = () => {
  const vm = useMedications();

  if (vm.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">İlaç Raporu</h1>
        <p className="text-muted-foreground">Tüm reçete edilen ilaçların geçmişi</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Reçete</CardTitle>
            <Pill className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{vm.medications.length}</div>
            <p className="text-xs text-muted-foreground mt-1">ilaç kaydı</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Farklı İlaç</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{vm.medicationSummary.length}</div>
            <p className="text-xs text-muted-foreground mt-1">çeşit ilaç</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">İlaç Alan Hasta</CardTitle>
            <User className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {vm.uniquePatientCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">hasta</p>
          </CardContent>
        </Card>
      </div>

      {/* Most Prescribed Medications */}
      {vm.sortedSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5 text-primary" />
              En Çok Reçete Edilen İlaçlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {vm.sortedSummary.slice(0, 5).map((med, index) => (
                <div
                  key={med.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-semibold">{med.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {med.patients.length} hastaya reçete edildi
                      </p>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-primary">{med.count}x</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Full List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Tüm İlaç Kayıtları</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="İlaç veya hasta ara..."
              value={vm.searchTerm}
              onChange={(e) => vm.setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {vm.filteredMedications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Pill className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                {vm.searchTerm ? "Sonuç bulunamadı" : "Henüz ilaç kaydı yok"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {vm.filteredMedications.map((med) => (
              <Card key={med.id} className="hover:shadow-medium transition-all">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Pill className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-lg">{med.medication_name}</p>
                        {med.dosage && (
                          <p className="text-sm text-muted-foreground">Doz: {med.dosage}</p>
                        )}
                        {med.instructions && (
                          <p className="text-sm text-muted-foreground mt-1">{med.instructions}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span>{med.appointment?.patient?.full_name || "Bilinmeyen"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground mt-1">
                        <Calendar className="w-3 h-3" />
                        <span>
                          {med.appointment?.appointment_date
                            ? format(new Date(med.appointment.appointment_date), "d MMM yyyy", { locale: tr })
                            : "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
