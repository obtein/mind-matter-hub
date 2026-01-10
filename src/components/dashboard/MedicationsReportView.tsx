import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Pill, Search, User, Calendar, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface MedicationRecord {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  created_at: string;
  appointment: {
    appointment_date: string;
    patient: {
      id: string;
      full_name: string;
    } | null;
  } | null;
}

interface MedicationSummary {
  name: string;
  count: number;
  patients: string[];
}

export const MedicationsReportView = () => {
  const [medications, setMedications] = useState<MedicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchMedications();
  }, []);

  const fetchMedications = async () => {
    try {
      const { data, error } = await supabase
        .from("session_medications")
        .select(`
          id,
          medication_name,
          dosage,
          instructions,
          created_at,
          appointments:appointment_id (
            appointment_date,
            patients:patient_id (
              id,
              full_name
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform the data to match our interface
      const transformedData: MedicationRecord[] = (data || []).map((med: any) => ({
        id: med.id,
        medication_name: med.medication_name,
        dosage: med.dosage,
        instructions: med.instructions,
        created_at: med.created_at,
        appointment: med.appointments ? {
          appointment_date: med.appointments.appointment_date,
          patient: med.appointments.patients
        } : null
      }));

      setMedications(transformedData);
    } catch (error: any) {
      toast.error("İlaç verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Calculate medication summary
  const medicationSummary: MedicationSummary[] = medications.reduce((acc, med) => {
    const existing = acc.find((m) => m.name.toLowerCase() === med.medication_name.toLowerCase());
    const patientName = med.appointment?.patient?.full_name || "Bilinmeyen";

    if (existing) {
      existing.count++;
      if (!existing.patients.includes(patientName)) {
        existing.patients.push(patientName);
      }
    } else {
      acc.push({
        name: med.medication_name,
        count: 1,
        patients: [patientName],
      });
    }
    return acc;
  }, [] as MedicationSummary[]);

  const sortedSummary = medicationSummary.sort((a, b) => b.count - a.count);

  const filteredMedications = medications.filter((med) =>
    med.medication_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    med.appointment?.patient?.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
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
            <div className="text-3xl font-bold">{medications.length}</div>
            <p className="text-xs text-muted-foreground mt-1">ilaç kaydı</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Farklı İlaç</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{medicationSummary.length}</div>
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
              {new Set(medications.map((m) => m.appointment?.patient?.id).filter(Boolean)).size}
            </div>
            <p className="text-xs text-muted-foreground mt-1">hasta</p>
          </CardContent>
        </Card>
      </div>

      {/* Most Prescribed Medications */}
      {sortedSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5 text-primary" />
              En Çok Reçete Edilen İlaçlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedSummary.slice(0, 5).map((med, index) => (
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {filteredMedications.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Pill className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                {searchTerm ? "Sonuç bulunamadı" : "Henüz ilaç kaydı yok"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredMedications.map((med) => (
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
