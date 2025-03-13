// File: StructuredResponseGenerator.js
import OpenAI from "openai";
import dotenv from "dotenv";

class StructuredResponseGenerator {
  constructor(apiKey) {
    if (!apiKey) {
      dotenv.config();
      apiKey = process.env.OPENAI_API_KEY;
    }
    this.setApiKey(apiKey);
  }

  setApiKey(apiKey) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }
    try {
      this.openai = new OpenAI({ apiKey });
    } catch (error) {
      throw new Error(`Failed to initialize OpenAI client: ${error.message}`);
    }
  }

  /**
   * Generates a response that adheres to a specific schema.
   * @param {string} query - The user's query.
   * @param {Object} schema - JSON schema defining the response structure.
   * @param {Object} context - Additional context for the query.
   * @returns {Promise<Object>} - Schema-compliant response.
   */
  async generateStructuredResponse(query, schema, context = {}) {
    if (!query) throw new Error("Query is required");
    if (!schema) throw new Error("Schema is required");

    const systemMessage = this._createSystemMessage(query, schema, context);

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [systemMessage],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });

      const messageContent = completion?.choices?.[0]?.message?.content;
      if (!messageContent) {
        throw new Error("No response content received from OpenAI.");
      }

      const response = JSON.parse(messageContent);
      return this.validateResponse(response, schema);
    } catch (error) {
      throw new Error(
        `Failed to generate structured response: ${error.message}`
      );
    }
  }

  /**
   * Helper method to create the system message for the OpenAI prompt.
   * @private
   */
  _createSystemMessage(query, schema, context) {
    return {
      role: "system",
      content: `You are an AI assistant that provides responses in a strictly structured format.

Query: ${query}
Context: ${JSON.stringify(context)}

Required Response Schema:
${JSON.stringify(schema, null, 2)}

Rules:
1. Response MUST be valid JSON
2. Response MUST follow the schema exactly
3. All required fields MUST be present
4. Data types MUST match schema specifications
5. Array items MUST match specified item types
6. String fields MUST respect any length constraints
7. Numeric fields MUST respect any range constraints
8. Enum fields MUST only use allowed values`,
    };
  }

  /**
   * Generates a simple key-value response.
   * @param {string} query - The user's query.
   * @param {Object} context - Additional context.
   * @param {string[]} requiredKeys - Array of required keys in the response.
   * @returns {Promise<Object>} - Response with required keys.
   */
  async generateKeyValueResponse(
    query,
    context = {},
    requiredKeys = ["response", "cliff_notes"]
  ) {
    const schema = {
      type: "object",
      properties: {},
      required: requiredKeys,
    };

    requiredKeys.forEach((key) => {
      if (key === "cliff_notes") {
        schema.properties[key] = {
          type: "array",
          description: `The ${key} content`,
          items: {
            type: "string",
            description: "Individual cliff note entry",
          },
        };
      } else {
        schema.properties[key] = {
          type: "string",
          description: `The ${key} content`,
        };
      }
    });

    return this.generateStructuredResponse(query, schema, context);
  }

  /**
   * Validates that a response matches the required schema.
   * @param {Object} response - The response to validate.
   * @param {Object} schema - The schema to validate against.
   * @returns {Object} - Validated response.
   */
  validateResponse(response, schema) {
    if (typeof response !== "object" || response === null) {
      throw new Error("Response must be an object");
    }

    // Check for missing required fields.
    if (schema.required) {
      const missingFields = schema.required.filter(
        (field) => !(field in response)
      );
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
      }
    }

    // Validate property types.
    for (const [key, value] of Object.entries(response)) {
      const propertySchema = schema.properties[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) {
          throw new Error(`Unexpected property: ${key}`);
        }
        continue;
      }

      // Validate non-array properties.
      if (
        propertySchema.type !== "array" &&
        typeof value !== propertySchema.type
      ) {
        throw new Error(
          `Property ${key} must be of type ${propertySchema.type}`
        );
      }

      // Validate array properties and their items.
      if (propertySchema.type === "array") {
        if (!Array.isArray(value)) {
          throw new Error(`Property ${key} must be an array`);
        }
        if (propertySchema.items) {
          value.forEach((item, index) => {
            if (typeof item !== propertySchema.items.type) {
              throw new Error(
                `Array item ${index} in ${key} must be of type ${propertySchema.items.type}`
              );
            }
          });
        }
      }
    }

    return response;
  }

  /**
   * Generates a JSON schema based on the provided required keys.
   * If a key is "cliff_notes", it will be set as an array of strings; all other keys default to a string type.
   *
   * @param {string[]} requiredKeys - Array of keys that are required in the schema.
   *                                  Defaults to ["response", "cliff_notes"] if not provided.
   * @returns {Object} - The generated JSON schema.
   */
  static schemaGenerator(requiredKeys = ["response", "cliff_notes"]) {
    const properties = {};

    requiredKeys.forEach((key) => {
      if (key === "cliff_notes") {
        properties[key] = {
          type: "array",
          description: `The ${key} content`,
          items: {
            type: "string",
            description: "Individual cliff note entry",
          },
        };
      } else {
        properties[key] = {
          type: "string",
          description: `The ${key} content`,
        };
      }
    });

    return {
      type: "object",
      properties,
      required: requiredKeys,
    };
  }
}

//example with predefined schema
const SCHEMA_EXAMPLE = {
  type: "object",
  properties: {
    thoughts: {
      type: "array",
      description: "The thoughts generated by the AI",
      items: {
        type: "string",
        description: "Individual thought",
      },
    },
    response: {
      type: "string",
    },
    action: {
      type: "string",
    },
  },
  required: ["response", "action", "thoughts"],
  additionalProperties: false,
};
// async function example() {
//   const generator = new StructuredResponseGenerator();
//   const query = "What is the meaning of life?";
//   const response = await generator.generateStructuredResponse(
//     query,
//     SCHEMA_EXAMPLE
//   );
//   const { thoughts, response: aiResponse, action } = response;
//   console.log("Thoughts:", thoughts);
//   console.log("Response:", aiResponse);
//   console.log("Action:", action);
// }
// example();
export { StructuredResponseGenerator };
