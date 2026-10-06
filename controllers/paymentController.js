

const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
const pay=async function (req,res) {
  ok(res,req.body)
}
module.exports={pay}