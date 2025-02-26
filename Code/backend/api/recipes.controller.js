import { request } from "express";
import RecipesDAO from "../dao/recipesDAO.js";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";

const defaultPassword = 'password';
export default class RecipesController {
    static async apiOAuthLogin(req, res) {
        console.log("received request for oauth login");
        const userName = req.body.email;

        if (!userName) {
            return res.status(400).json({ message: "Username is required" });
        }

        try {
            let filters = {};
            filters.userName = userName;
            filters.password = defaultPassword;
            console.log("received request for login");
            console.log(filters)
            const { success, user } = await RecipesDAO.getUser({
                filters,
            });

            if (success) {
                return res.status(400).json({ message: "Username already exists" });
            }

            let data = {};
            data.userName = userName;
            data.password = defaultPassword;
            const { success2, user2 } = await RecipesDAO.addUser({
                data,
            });
        } catch (error) {
            console.error("Error during OAuth login:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    }

    static async apiAuthLogin(req, res) {
        let filters = {};
        filters.userName = req.query.userName;
        filters.password = req.query.password;
        const { success, user } = await RecipesDAO.getUser({
            filters,
        });
        res.json({ success, user });
    }
    static async apiAuthSignup(req, res) {
        if (req.body) {
            let data = {};
            data.userName = req.body.userName;
            data.password = req.body.password;
            const { success, user } = await RecipesDAO.addUser({
                data,
            });
            res.json({ success, user });
        }
    }

    static async apiGetBookmarks(req, res) {
        if (req.query.userName) {
            const bookmarks = await RecipesDAO.getBookmarks(req.query.userName);
            console.log(bookmarks);
            res.json({ bookmarks });
        } else {
            res.json("Username not given");
        }
    }

    static async apiGetBookmarkedRecipes(req, res) {
        const userName = req.query.userName;
        if (!userName)
            return res.status(400).json({ error: "Username required" });

        try {
            const response = await RecipesDAO.getBookmarkedRecipes(userName);
            res.json(response);
        } catch (e) {
            console.error(`Failed to retrieve bookmarks for ${userName}:`, e);
            res.status(500).json({ error: "Failed to retrieve bookmarks" });
        }
    }

    static async apiPostRecipeToProfile(req, res) {
        if (req.body) {
            const { userName, recipe } = req.body;
            try {
                const response = RecipesDAO.addRecipeToProfile(
                    userName,
                    recipe
                );
                res.json(response);
            } catch (e) {
                console.log(`error: ${e}`);
            }
        } else {
            res.json({ success: false });
        }
    }

    static async apiRemoveRecipeFromProfile(req, res) {
        if (req.body) {
            const { userName, recipe } = req.body;
            try {
                const response = await RecipesDAO.removeRecipeFromProfile(
                    userName,
                    recipe
                );
                res.json(response);
            } catch (e) {
                console.log(`error: ${e}`);
                res.status(500).json({ error: e.message });
            }
        } else {
            res.json({ success: false });
        }
    }

    static async apiGetRecipeByName(req, res) {
        let filters = {};
        //Checking the query to find the required results
        console.log(req.query);
        if (req.query.recipeName) {
            filters.recipeName = req.query.recipeName;
        }

        const { recipesList } = await RecipesDAO.getRecipeByName({
            filters,
        });

        let response = {
            recipes: recipesList,
        };
        res.json(response);
    }

    static async apiGetRecipes(req, res, next) {
        // console.log("Is anyone even reaching here!????")
        const recipesPerPage = req.query.recipesPerPage
            ? parseInt(req.query.recipesPerPage, 10)
            : 20;
        const page = req.query.page ? parseInt(req.query.page, 10) : 0;

        let filters = {};
        //Checking the query to find the required results
        console.log(req.query)

        // if (req.query.CleanedIngredients) {
        filters.CleanedIngredients = req.query.CleanedIngredients;
        filters.Cuisine = req.query.Cuisine;
        filters.Email = req.query.Email;
        filters.Flag = req.query.Flag;
        filters.maxTime = req.query.maxTime;
        filters.type = req.query.type;
        // }

        // console.log("Filters are: \n\n\n\n", filters)

        const { recipesList, totalNumRecipes } = await RecipesDAO.getRecipes({
            filters,
            page,
            recipesPerPage,
        });

        let response = {
            recipes: recipesList,
            page: page,
            filters: filters,
            entries_per_page: recipesPerPage,
            total_results: totalNumRecipes,
        };
        res.json(response);
    }
    
    //Function to get the cuisines
    static async apiGetRecipeCuisines(req, res, next) {
        try {
            let cuisines = await RecipesDAO.getCuisines();
            res.json(cuisines);
        } catch (e) {
            console.log(`api, ${e}`);
            res.status(500).json({ error: e });
        }
    }

    static async apiPostRecipe(req, res, next) {
        try {
            let response = await RecipesDAO.addRecipe(req.body);
            res.json(response);
        } catch (e) {
            console.log(`api, ${e}`);
            res.status(500).json({ error: e });
        }
    }

    static async apiGetIngredients(req, res, next) {
        console.log("received request for ingredients");
        try {
            let ingredients = await RecipesDAO.getIngredients();
            res.json(ingredients);
        } catch (e) {
            res.status(500).json({ error: e });
        }
    }
    
    static async apiGenerateRecipe(req, res) {
        const { ingredients, cuisineFromForm, maxTime, type } = req.body;
        // console.log("rq body: ", req.body);

        if (!ingredients.length > 0) {
            return res.status(400).json({ message: "Recipe ingredients are required" });
        }

        try {
            let prompt = `Generate a recipe in JSON format with this structure:
            {
            "name": "Recipe Name",
            "description": "Brief description (include ${cuisineFromForm ? cuisineFromForm + ' cuisine' : ''} ${type ? 'for ' + type + ' diet' : ''} ${maxTime ? 'ready in ' + maxTime + ' minutes' : ''})",
            "ingredients": ["list", "of", "ingredients"],
            "instructions": ["step 1", "step 2", "step 3"]
            }

            Requirements:
            1. Ingredients must be an array of strings with exact measurements (e.g., "1 cup flour")
            2. Instructions must be a numbered array of detailed steps
            3. Include cooking time estimates in instructions where relevant
            4. Never use markdown formatting
            5. Include essential cooking techniques and temperatures
            6. Do not include the initial json structure in the response, just start with the curly brackets

            Base the recipe on these ingredients: ${ingredients.join(", ")}
            ${cuisineFromForm ? `Cuisine style: ${cuisineFromForm}` : ''}
            ${type ? `Dietary requirements: ${type}` : ''}
            ${maxTime ? `Maximum cooking time: ${maxTime} minutes` : ''}

            Example response:
            {
            "name": "Vegetarian Lentil Bolognese",
            "description": "Italian-inspired meat-free pasta sauce ready in 40 minutes",
            "ingredients": [
                "1 cup brown lentils",
                "2 tbsp olive oil",
                "1 onion, diced"
            ],
            "instructions": [
                "Rinse lentils and soak in warm water for 10 minutes",
                "Heat oil in pan over medium heat..."
            ]
            }

            ONLY RETURN VALID JSON WITHOUT MARKDOWN WRAPPING OR ADDITIONAL TEXT`;

            console.log("Prompt: ", prompt);

            const genAI = new GoogleGenerativeAI("AIzaSyCYbwgMdaBbkK6XFssMpBjCOqFkQUqu40U");
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

            const result = await model.generateContent(prompt);

            console.log("Result: ", result.response.text().slice(7,-3));
            const recipeData = JSON.parse(result.response.text().slice(7,-3));

            // console.log("my recipe: ", recipeData);
            res.json({ generatedRecipe: recipeData });
        } catch (error) {
            console.error("Error generating response:", error.response?.data || error.message);
            res.status(500).json({ 
                message: "Failed to generate response",
                error: error.response?.data || error.message 
            });
        }
    }
}