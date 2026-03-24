import { useState, useEffect, useMemo, useCallback } from "react";
import { useDb } from "@/services/ServiceContext";
import { MedicationRepository } from "@/repositories/MedicationRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";

export interface MedicationRecord {
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

export interface MedicationSummary {
  name: string;
  count: number;
  patients: string[];
}

export function useMedications() {
  const db = useDb();
  const medicationRepo = useMemo(() => new MedicationRepository(db), [db]);

  const [medications, setMedications] = useState<MedicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchMedications = useCallback(async () => {
    try {
      const data = await medicationRepo.getAllWithDetails();
      setMedications(data);
    } catch (error: unknown) {
      toast.error(handleError(error, "İlaç verileri yüklenemedi"));
    } finally {
      setLoading(false);
    }
  }, [medicationRepo]);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const medicationSummary = useMemo<MedicationSummary[]>(() => {
    return medications.reduce((acc, med) => {
      const existing = acc.find(
        (m) => m.name.toLowerCase() === med.medication_name.toLowerCase()
      );
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
  }, [medications]);

  const sortedSummary = useMemo(() => {
    return [...medicationSummary].sort((a, b) => b.count - a.count);
  }, [medicationSummary]);

  const filteredMedications = useMemo(() => {
    return medications.filter(
      (med) =>
        med.medication_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        med.appointment?.patient?.full_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase())
    );
  }, [medications, searchTerm]);

  const uniquePatientCount = useMemo(() => {
    return new Set(
      medications.map((m) => m.appointment?.patient?.id).filter(Boolean)
    ).size;
  }, [medications]);

  return {
    // State
    medications,
    loading,
    searchTerm,
    medicationSummary,
    sortedSummary,
    filteredMedications,
    uniquePatientCount,

    // Setters
    setSearchTerm,

    // Actions
    refresh: fetchMedications,
  };
}
