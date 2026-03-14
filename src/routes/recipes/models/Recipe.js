const mongoose = require('mongoose');

const { Schema } = mongoose;

const IngredientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const StepSchema = new Schema(
  {
    id: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    substeps: { type: [String], default: undefined },
  },
  { _id: false }
);

const RecipeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    keywords: { type: [String], default: [] },
    steps: {
      type: [StepSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'At least one step is required',
      },
    },
    ingredients: { type: [IngredientSchema], default: undefined },
    prepTimeMinutes: { type: Number, required: true, min: 0 },
    cookTimeMinutes: { type: Number, required: true, min: 0 },
    image: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recipe', RecipeSchema);
