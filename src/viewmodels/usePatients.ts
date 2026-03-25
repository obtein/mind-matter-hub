import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth, useDb } from "@/services/ServiceContext";
import { PatientRepository } from "@/repositories/PatientRepository";
import type { Patient, PatientInsert } from "@/services/db";
import { toast } from "sonner";
import { handleError } from "@/lib/errorHandler";

export interface PatientFormData {
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  address: string;
  meslek: string;
  notes: string;
}

const EMPTY_FORM: PatientFormData = {
  full_name: "", phone: "", date_of_birth: "", gender: "", address: "", meslek: "", notes: "",
};

export type PatientWithAppointment = Patient & { last_appointment: string | null };

export function usePatients() {
  const auth = useAuth();
  const db = useDb();
  const repo = useMemo(() => new PatientRepository(db), [db]);

  const [patients, setPatients] = useState<PatientWithAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientWithAppointment | null>(null);
  const [deletePatientId, setDeletePatientId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PatientFormData>(EMPTY_FORM);
  const [displayCount, setDisplayCount] = useState(50);

  const fetchPatients = useCallback(async () => {
    try {
      const data = await repo.getAllWithLastAppointment();
      setPatients(data);
      setError(null);
    } catch (err: unknown) {
      setError(handleError(err, "Hastalar yüklenemedi"));
      toast.error("Hastalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  // Reset pagination when filters change
  useEffect(() => {
    setDisplayCount(50);
  }, [searchTerm, genderFilter]);

  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      const matchesSearch = p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || p.phone?.includes(searchTerm);
      const matchesGender = genderFilter === "all" || p.gender === genderFilter;
      return matchesSearch && matchesGender;
    });
  }, [patients, searchTerm, genderFilter]);

  const displayedPatients = useMemo(
    () => filteredPatients.slice(0, displayCount),
    [filteredPatients, displayCount]
  );

  const hasMore = displayCount < filteredPatients.length;

  const loadMore = useCallback(() => {
    setDisplayCount((prev) => prev + 50);
  }, []);

  const resetForm = useCallback(() => {
    setEditingPatient(null);
    setFormData(EMPTY_FORM);
  }, []);

  const openNewDialog = useCallback(() => {
    resetForm();
    setIsDialogOpen(true);
  }, [resetForm]);

  const openEditDialog = useCallback((patient: PatientWithAppointment) => {
    setEditingPatient(patient);
    setFormData({
      full_name: patient.full_name,
      phone: patient.phone || "",
      date_of_birth: patient.date_of_birth || "",
      gender: patient.gender || "",
      address: patient.address || "",
      meslek: patient.meslek || "",
      notes: patient.notes || "",
    });
    setIsDialogOpen(true);
  }, []);

  const validatePhone = (phone: string): boolean => {
    if (!phone) return true;
    return /^[0-9\s\-+()]{7,15}$/.test(phone);
  };

  const submitPatient = useCallback(async () => {
    if (!validatePhone(formData.phone)) {
      toast.error("Geçersiz telefon numarası");
      return false;
    }

    try {
      const user = await auth.getUser();
      if (!user) throw new Error("Kullanıcı bulunamadı");

      const patientData = {
        full_name: formData.full_name,
        phone: formData.phone || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        address: formData.address || null,
        meslek: formData.meslek || null,
        notes: formData.notes || null,
      };

      if (editingPatient) {
        await repo.update(editingPatient.id, patientData);
        toast.success("Hasta güncellendi");
      } else {
        await repo.create({ ...patientData, doctor_id: user.id });
        toast.success("Hasta eklendi");
      }

      setIsDialogOpen(false);
      resetForm();
      await fetchPatients();
      return true;
    } catch (error: unknown) {
      toast.error(handleError(error, "Hasta kaydedilemedi"));
      return false;
    }
  }, [auth, editingPatient, formData, repo, resetForm, fetchPatients]);

  const deletePatient = useCallback(async (id: string) => {
    try {
      await repo.delete(id);
      toast.success("Hasta silindi");
      await fetchPatients();
    } catch (error: unknown) {
      toast.error(handleError(error, "Hasta silinemedi"));
    }
  }, [repo, fetchPatients]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setGenderFilter("all");
  }, []);

  return {
    // State
    patients,
    loading,
    error,
    searchTerm,
    genderFilter,
    isDialogOpen,
    editingPatient,
    deletePatientId,
    formData,
    filteredPatients,
    displayedPatients,
    hasMore,

    // Setters
    setSearchTerm,
    setGenderFilter,
    setIsDialogOpen,
    setDeletePatientId,
    setFormData,

    // Actions
    openNewDialog,
    openEditDialog,
    submitPatient,
    deletePatient,
    resetForm,
    clearFilters,
    loadMore,
    refresh: fetchPatients,
  };
}
