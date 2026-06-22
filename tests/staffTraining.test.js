import { describe, expect, it } from "vitest";
import {
  TRAINING_STATUS,
  TRAINING_TYPE,
  resolveStaffStatusAfterTrainingComplete,
  validateTrainingSave,
} from "../src/client/components/staff/staffTrainingHelpers";

describe("staffTraining helpers", () => {
  it("validates training save payload", () => {
    expect(validateTrainingSave({})).toEqual({ ok: false, message: "Chọn nhân viên." });
    expect(
      validateTrainingSave({
        maNhanVien: "NV000001",
        loaiDaoTao: TRAINING_TYPE.ONBOARDING,
        tuNgay: "2026-06-09",
        denNgay: "2026-06-09",
        noiDung: "Hội nhập TLC",
      }),
    ).toMatchObject({ ok: true, loaiDaoTao: TRAINING_TYPE.ONBOARDING });
  });

  it("updates staff status after training completion", () => {
    expect(
      resolveStaffStatusAfterTrainingComplete(
        { trangThai: "Thử việc" },
        { loaiDaoTao: TRAINING_TYPE.ONBOARDING, trangThai: TRAINING_STATUS.COMPLETED },
      ),
    ).toBe("Đào tạo");
    expect(
      resolveStaffStatusAfterTrainingComplete(
        { trangThai: "Đào tạo" },
        { loaiDaoTao: TRAINING_TYPE.SPECIALTY, trangThai: TRAINING_STATUS.COMPLETED },
      ),
    ).toBe("Đang làm việc");
    expect(
      resolveStaffStatusAfterTrainingComplete(
        { trangThai: "Đang làm việc" },
        { loaiDaoTao: TRAINING_TYPE.SPECIALTY, trangThai: TRAINING_STATUS.COMPLETED },
      ),
    ).toBeNull();
  });
});
