/* eslint-disable max-len */
/* eslint-disable camelcase */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const bp = require("body-parser");
const dotenv = require("dotenv");
const cors = require("cors");
const app = express();
const Razorpay = require("razorpay");

// we are using the crypto for creating the receipt randomly
const crypto = require("crypto");
// const { LOADIPHLPAPI } = require("dns");
// const { response } = require("express");

dotenv.config();
app.use(express.json());
app.use(cors());

// intializing the firebase credentials
admin.initializeApp();
const database = admin.database();

app.use(express.json());
app.use(bp.urlencoded({extended: true}));

app.get("/", (req, res)=>{
    res.send("Hello from backend");
});

// THese endpoints are for creating the orders OneTime/subscription

// create orders
app.post("/orders", async (req, res) => {
    const price = req.body.amount;
    // console.log(req.body.amount);
    try {
        // creating the instance of the razorpay
        const instance = new Razorpay({
            key_id: process.env.KEY_ID,
            key_secret: process.env.KEY_SECRET,
        });

        // now creating the obejct namely-options for creating the order
        const options = {
            amount: price * 100,
            currency: "INR",
            notes: {
                id: req.body.id,
                typeOfUser: req.body.typeOfUser,
                typeOfPlanPurchased: "One Time Monthly",
            },
            receipt: crypto.randomBytes(10).toString("hex"),
        };

        instance.orders.create(options, (error, order) => {
            if (error) {
                console.log("Error : " + error);
                return res.status(500).json({message: "Something Went Wrong"});
            }
            console.log(order);
            res.status(200).json({data: order});
        });
    } catch (error) {
        console.log("Error : " + error);
        res.status(500).json({message: "Internal server error!"});
    }
});

// payment verify

app.post("/verify", async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = req.body;
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", process.env.KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        // comparing the signatures
        if (razorpay_signature === expectedSign) {
            res.send("Payment Successfully");
        } else {
            return res.status(400).json({message: "Invalid signature sent!"});
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({message: "Internal Server Error!"});
    }
});

// Making the Plans - monthly and yearly

app.post("/plans", (req, res) => {
    const instance = new Razorpay({
        key_id: process.env.KEY_ID,
        key_secret: process.env.KEY_SECRET,
    });

    const yearlyPlan = {
        period: "yearly",
        interval: 1,
        item: {
            name: "Test plan - yearly",
            amount: 2000000,
            currency: "INR",
            description: "Description for the yearly test plan",
        },
    };

    // const monthlyPlan = {
    //     period: "monthly",
    //     interval: 1,
    //     item: {
    //         name: "New-Test plan - Monthly",
    //         amount: 499900,
    //         currency: "INR",
    //         description: "Description for the monthly test plan",
    //     },
    // };

    instance.plans.create(yearlyPlan, (error, plan) => {
        if (error) {
            console.log(error);
        }
        res.status(200).json({data: plan});
        // console.log(plan.id);
    });
});

// for creating the subscriptions

app.post("/subscriptions", (req, res) => {
    const instance = new Razorpay({
        key_id: process.env.KEY_ID,
        key_secret: process.env.KEY_SECRET,
    });

    const subscription = {
        plan_id: req.body.plan_id,
        customer_notify: 1,
        quantity: 1,
        total_count: 1,
        notes: {
            id: req.body.id,
            typeOfUser: req.body.typeOfUser,
            typeOfPlanPurchased: req.body.typeOfPlanPurchased,
        },
    };

    instance.subscriptions.create(subscription, (error, subscription) => {
        if (error) {
            console.log(error);
        }
        res.status(200).json(subscription);
    });
});

// these endpoints receive the data from the razorpay API

// endpoint for OneTimeOrder payments
app.post("/orderwebhook", async (req, res) => {
    try {
        const responseData = await eval(req.body);
        // console.log(responseData.payload.order.entity.notes);
        // logic code for searching the user in the quickreach realtimedatabase
        const {id, typeOfUser, typeOfPlanPurchased} = (responseData.payload.order.entity.notes);
        if (id) {
            console.log("Data Enters in the console");
            const db = await database.ref("QuickReach/"+typeOfUser+"/"+id);
            db.update(
                {
                    "isAllowedToIncreaseReachRetweets": true,
                    "isPaidToIncreaseReach": true,
                    "planPurchaseDate": new Date(responseData.created_at).getTime(),
                    "typeOfPlanPurchased": typeOfPlanPurchased,
                });
            res.status(200).json({message: "Data added in real time database"});
        } else {
            res.status(400).json({message: "Notes not found"});
        }
    } catch (error) {
        console.log(error);
    }
});

// endpoint for subscription payments
app.post("/subscriptionwebhook", async (req, res) => {
    try {
        const responseData = await eval(req.body);
        // console.log(responseData.payload.subscription.entity.notes);
        // logic code for searching the user in the quickreach realtimedatabase
        const {id, typeOfUser, typeOfPlanPurchased} = (responseData.payload.subscription.entity.notes);
        if (id) {
            const db = await database.ref("QuickReach/"+typeOfUser+"/"+id);
            db.update(
                {
                    "isAllowedToIncreaseReachRetweets": true,
                    "isPaidToIncreaseReach": true,
                    "planPurchaseDate": new Date(responseData.created_at),
                    "typeOfPlanPurchased": typeOfPlanPurchased,
                });
            res.status(200).json({message: "Data added in real time database"});
        } else {
            res.status(400).json({message: "Notes not found"});
        }
    } catch (error) {
        console.log(error);
    }
});

exports.testAPI = functions.https.onRequest(app);
