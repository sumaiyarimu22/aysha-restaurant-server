const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT;
const stripe = require("stripe")(process.env.STRIPE_KEY);

// middlewre
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("resturent running");
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r0bcwrk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const menuCollection = client.db("resturent").collection("menu");
    const cartCollection = client.db("resturent").collection("carts");
    // const reviewCollection = client.db("resturent").collection("reviews");
    const userCollection = client.db("resturent").collection("users");
    const paymentCollection = client.db("resturent").collection("payments");

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Forbidden access" });
        }
        req.decoded = decoded;
      });

      next();
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {
        email: email,
      };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "foebidden access" });
      }
      next();
    };

    // create jwt
    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_KEY, {
        expiresIn: "30d",
      });

      res.send({ token });
    });

    // get all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //  get admin
    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unAuthorize access" });
      }

      const query = {
        email: email,
      };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }

      res.send({ admin });
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // access to admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = {
          _id: new ObjectId(id),
        };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menu = req.body;
      const result = await menuCollection.insertOne(menu);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const menu = req.body;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          name: menu.name,
          category: menu.category,
          price: menu.price,
          recipe: menu.recipe,
          image: menu.image,
        },
      };

      const result = await menuCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exist" });
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // payment

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;

        if (!price || isNaN(price) || price <= 0) {
          return res.status(400).send({ error: "Invalid price value" });
        }

        const amount = parseInt(price * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // carefully delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };

      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    app.get("/paymentHistory/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };

      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // state or analytics
    app.get("/admin-state", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menu = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({ users, menu, orders, revenue });
    });

    // useing aggregate  pipeline
    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",
          },
          {
            $addFields: {
              menuItemObjectId: {
                $convert: {
                  input: "$menuItemIds",
                  to: "objectId",
                  onError: null, // Handle conversion errors
                  onNull: null,
                },
              },
            },
          },
          {
            $lookup: {
              from: "menu",
              localField: "menuItemObjectId",
              foreignField: "_id",
              as: "menuItems",
            },
          },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: {
                $sum: 1,
              },
              revenue: {
                $sum: "$menuItems.price",
              },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              revenue: "$revenue",
            },
          },
        ])
        .toArray();
      // console.log(result);
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`running port on  ${port}`);
});
