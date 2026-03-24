import type { DbService, MedicationInsert } from "@/services/db";

export class MedicationRepository {
  constructor(private db: DbService) {}
  getByAppointment(appointmentId: string) { return this.db.getMedicationsByAppointment(appointmentId); }
  getByAppointmentIds(ids: string[]) { return this.db.getMedicationsByAppointmentIds(ids); }
  getAllWithDetails() { return this.db.getAllMedicationsWithDetails(); }
  create(data: MedicationInsert) { return this.db.createMedication(data); }
  delete(id: string) { return this.db.deleteMedication(id); }
}
