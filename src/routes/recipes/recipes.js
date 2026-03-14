const express = require('express');
const controller = require('./controllers/recipeController');

const router = express.Router();

router.get('/get-all', controller.getAllRecipes);
router.put('/update/:id', controller.updateRecipe);
router.delete('/delete/:id', controller.deleteRecipe);
router.post('/new', controller.createRecipe);

module.exports = router;
