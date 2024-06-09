import { } from "@citation-js/plugin-wikidata";
import { QueryEngine } from "@comunica/query-sparql";
// const SparqlParser = require('sparqljs').Parser;

// https://stackoverflow.com/questions/29601839/standard-regex-to-prevent-sparql-injection/55726984#55726984
const escapeForTurtle = (s: string) => s.replace(/(["'\\])/g, '\\$1')

async function getAuthors(name: string) {
    const apiRootUrl = "";
    const query = `
        PREFIX wikibase: <http://wikiba.se/ontology#>
        PREFIX bd: <http://www.bigdata.com/rdf#>
        PREFIX p: <http://www.wikidata.org/prop/>
        PREFIX ps: <http://www.wikidata.org/prop/statement/>
        SELECT DISTINCT ?item ?itemLabel WHERE {
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE]". }
        {
            SELECT DISTINCT ?item WHERE {
                ?item p:P2093 ?statement0.
                ?statement0 (ps:P2093) """${escapeForTurtle(name)}""".
            }
            LIMIT 100
        }
    }`;

    const queryEngine = new QueryEngine();
    // const result = await queryEngine.query(query);

    let bs = await queryEngine.queryBindings(query, { sources: ["https://query.wikidata.org/sparql"] });
    let result = bs.on('data', (binding) => {
    console.log(binding.toString()); // Quick way to print bindings for testing
    
    // // Obtaining values
    // console.log(binding.get('item').value);
    // console.log(binding.get('itemLabel').termType);
    // console.log(binding.get('p').value);
    // console.log(binding.get('statement0').value);
})

    // return result;
}

let foo = await getAuthors("Douglas Adams")
// console.log(foo)

