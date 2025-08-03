import express from 'express'
const router = express.Router()
import {
    initiateSTKPush,
    stkPushCallback,
    confirmPayment,
    warmupMpesa
} from "../controllers/controllers.lipanampesa.js";


import {accessToken} from "../middlewares/middlewares.generateAccessToken.js";

router.route('/stkPush').post(accessToken,initiateSTKPush)
router.route('/stkPushCallback/:Order_ID').post(stkPushCallback)
router.route('/confirmPayment/:CheckoutRequestID').post(accessToken,confirmPayment)
router.route('/warmupMpesa').post(warmupMpesa)

export default router
