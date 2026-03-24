import type { DbService, PatientInsert } from "@/services/db";

export class PatientRepository {
  constructor(private db: DbService) {}
  getAll() { return this.db.getPatients(); }
  getAllWithLastAppointment() { return this.db.getPatientsWithLastAppointment(); }
  getById(id: string) { return this.db.getPatient(id); }
  create(data: PatientInsert) { return this.db.createPatient(data); }
  update(id: string, data: Partial<Omit<PatientInsert, "doctor_id">>) { return this.db.updatePatient(id, data); }
  delete(id: string) { return this.db.deletePatient(id); }
  getLastAppointmentDate(patientId: string) { return this.db.getLastAppointmentDate(patientId); }
  getForStats() { return this.db.getPatientsForStats(); }
  getName(id: string) { return this.db.getPatientName(id); }
  getProfile() { return this.db.getProfile(); }
}
