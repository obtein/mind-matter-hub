import { useState, useEffect, useMemo, useCallback } from "react";
import { useDb } from "@/services/ServiceContext";
import { MedicationRepository } from "@/repositories/MedicationRepository";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";
import { matchesText, searchKey } from "@/lib/search";

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
  patientKeys: string[];
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
      const key = searchKey(med.medication_name);
      const existing = acc.find((m) => searchKey(m.name) === key);
      const patientName = med.appointment?.patient?.full_name || "Bilinmeyen";
      // Two patients can share a name; count them by id when it is known.
      const patientKey = med.appointment?.patient?.id || `name:${patientName}`;

      if (existing) {
        existing.count++;
        if (!existing.patientKeys.includes(patientKey)) {
          existing.patientKeys.push(patientKey);
          existing.patients.push(patientName);
        }
      } else {
        acc.push({
          name: med.medication_name.trim(),
          count: 1,
          patients: [patientName],
          patientKeys: [patientKey],
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
        matchesText(med.medication_name, searchTerm) ||
        matchesText(med.appointment?.patient?.full_name, searchTerm)
    );
  }, [medications, searchTerm]);

  // Pagination for large medication lists
  const [displayCount, setDisplayCount] = useState(50);

  useEffect(() => {
    setDisplayCount(50);
  }, [searchTerm]);

  const displayedMedications = useMemo(
    () => filteredMedications.slice(0, displayCount),
    [filteredMedications, displayCount]
  );

  const hasMoreMedications = displayCount < filteredMedications.length;

  const loadMoreMedications = useCallback(() => {
    setDisplayCount((prev) => prev + 50);
  }, []);

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
    displayedMedications,
    hasMoreMedications,
    uniquePatientCount,

    // Setters
    setSearchTerm,

    // Actions
    refresh: fetchMedications,
    loadMoreMedications,
  };
}
