const { mongo } = require('@enterprise/shared');
const { mongoose } = mongo;

/**
 * Bộ đếm mã nhân viên theo tổ chức (sequence generator kiểu Workday).
 * allocate: $inc atomic → VH-{seq}.
 */
const employeeCodeCounterSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
      index: true,
    },
    /** Số sắp cấp tiếp theo (sau $inc, giá trị hiện tại = mã vừa cấp). */
    nextSeq: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EmployeeCodeCounter', employeeCodeCounterSchema);
