import { } from "node:readline";
import { } from "@citation-js/plugin-wikidata";
import { QueryEngine } from "@comunica/query-sparql";

// https://stackoverflow.com/questions/29601839/standard-regex-to-prevent-sparql-injection/55726984#55726984
function escapeSPARQL(str: string): string {
  return str.replace(/(["'\\])/g, "\\$1");
}

// Make a request to the Wikidata SPAQL API, using a given SPARQL query (as it would be entered in https://query.wikidata.org/)
// Returns an array of bindings (https://comunica.dev/docs/query/getting_started/query_app/#3-3-consuming-binding-results-as-an-array)
async function makeRequest(query: string) {
  const queryWithPrefixes = `
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX bd: <http://www.bigdata.com/rdf#>
${query}`;

  // console.log(queryWithPrefixes);

  const bindingsStream = await new QueryEngine().queryBindings(queryWithPrefixes, {
    sources: ["https://query.wikidata.org/sparql"],
  });

  return await bindingsStream
    .on("error", (error) => {
      console.error(error);
    })
    .toArray();
}

class Person {
  name: string;
  description: string;
  id: string;

  constructor(name: string, description: string, id: string) {
    this.name = name;
    this.description = description;
    this.id = id;
  }

  toString() {
    return `${this.id}: ${this.name} (${this.description})`;
  }
}

// Get a list of authors with an exact name (e.g. "Douglas Adams")
async function getAuthors(name: string): Promise<Person[]> {
  const query = `
SELECT
  ?id          # Ex. Q42
  ?name        # Ex. Douglas Adams
  ?description # Ex. English author and humourist (1952–2001)
WHERE {
  VALUES ?name {
    "${escapeSPARQL(name)}"@en
  }

  ?id wdt:P31 wd:Q5;                 # The ID of an instance of human,
    rdfs:label ?name;                # ...whose entity label matches ?name,
    schema:description ?description. # ...and get their single-sentence entity description

  FILTER((LANG(?name)) = "en")        # Only names in English
  FILTER((LANG(?description)) = "en") # Only descriptions in English
}`;

  const result: Person[] = (await makeRequest(query)).map((binding) => {
    const name: string | undefined = binding.get("name")?.value;
    const description: string | undefined = binding.get("description")?.value;
    const id: string | undefined = binding.get("id")?.value;

    if (name === undefined || description === undefined || id === undefined)
      throw new Error("Undefined trait in result!");

    return new Person(name, description, id);
  });

  return result;
}

class Field {
  label: string;
  value: string;

  constructor(label: string, value: string) {
    this.label = label;
    this.value = value;
  }

  toString() {
    return `${this.label}: ${this.value}`;
  }
}

// Get information about a given author, using an exact ID (ex. Q42)
// onlyWikidataEntities filters results to only those with Wikidata entries (not literal values)
async function getAuthorInfo(id: `Q${number}`, onlyWikidataEntities = true): Promise<Field[]> {
  const query = `
SELECT DISTINCT
  ?propID     # Ex. P734
  ?propLabel  # Ex. family name
  ?value      # Ex. Q351735
  ?valueLabel # Ex. Adams
WHERE {
  VALUES ?target {
    wd:${id}
  }

  ?target ?propID ?value.

  ?prop wikibase:directClaim ?propID.

  # Filters results to only those with Wikidata entries
  # Ex. Q84 but not douglasadams
  ${onlyWikidataEntities ? "#" : ""} FILTER(CONTAINS(STR(?value), "/entity/Q"))

  # Fetchs the label for every ?variable, the result of which is stored in ?variableLabel
  SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
}
ORDER BY (UCASE(?propID))`;

  const result: Field[] = (await makeRequest(query)).map((binding) => {
    const label: string | undefined = binding.get("propLabel")?.value;
    const value: string | undefined = binding.get("valueLabel")?.value;

    if (label === undefined || value === undefined) throw new Error("Undefined trait in result!");

    return new Field(label, value);
  });

  return result;
}

console.log(await getAuthors("William Carpenter"), await getAuthorInfo("Q8006577"));
// console.log(await getAuthors("Douglas Adams"));
