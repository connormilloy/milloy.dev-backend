const mongoose = require('mongoose');
const Recipe = require('../models/Recipe.js');

exports.getAllRecipes = async function (req, res) {
  try {
    const recipes = await Recipe.find().sort({ createdAt: -1 });
    res.status(200).json(recipes);
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Failed to fetch recipes', error: err.message });
  }
};

exports.createRecipe = async function (req, res) {
  try {
    const recipe = await Recipe.create(req.body);
    res.status(201).json(recipe);
  } catch (err) {
    res
      .status(400)
      .json({ message: 'Failed to create recipe', error: err.message });
  }
};

exports.updateRecipe = async function (req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid recipe id' });
    }

    const recipe = await Recipe.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    res.status(200).json(recipe);
  } catch (err) {
    res
      .status(400)
      .json({ message: 'Failed to update recipe', error: err.message });
  }
};

exports.deleteRecipe = async function (req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid recipe id' });
    }

    const recipe = await Recipe.findByIdAndDelete(id);

    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    res.status(200).json({ message: 'Recipe deleted' });
  } catch (err) {
    res
      .status(500)
      .json({ message: 'Failed to delete recipe', error: err.message });
  }
};
